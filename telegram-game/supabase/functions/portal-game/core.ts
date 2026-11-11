// Bot logic for the Portal Flight widget. Runtime-neutral on purpose: no Deno or npm imports,
// so the same file runs in the Supabase Edge Function and under `node --test`.

/** Must equal MIN_GATE_MS in widget/game.js (a test checks it). */
export const MIN_GATE_MS = 863;
const MAX_FRIENDS = 15;
const RUN_MAX_MS = 30 * 60 * 1000;
const EDIT_GAP_MS = 1000;
const NAME_LEN = 16;
const LIMIT_BYTES = 1024;
const CAPTION = "Portal Flight — тапай, чтобы лететь. Имя из профиля увидят другие, если попадёшь в топ-10.";

export interface Store {
  /** Creates the player or refreshes the name. `referrerId` is kept only when the player is new. */
  upsertPlayer(id: number, name: string, username: string | null, referrerId: number | null): Promise<{ isNew: boolean }>;
  /** Records the run start and marks the player as having played. */
  startRun(id: number, nowMs: number): Promise<void>;
  /** Returns the start time of the open run and consumes it, or null. */
  takeRun(id: number): Promise<number | null>;
  friendsCount(id: number): Promise<number>;
  submit(id: number, final: number, nowMs: number): Promise<{ best: number; place: number }>;
  getPlayer(id: number): Promise<{ best: number; place: number } | null>;
  top10(): Promise<{ id: number; name: string; best: number }[]>;
  getConfig(key: string): Promise<string | null>;
  setConfig(key: string, value: string): Promise<void>;
}

export interface Tg {
  /** Calls a Bot API method and returns its `result`; throws Error(description) on failure. */
  call(method: string, params: Record<string, unknown>): Promise<any>;
}

export interface Deps {
  store: Store;
  tg: Tg;
  now: () => number;
  html: string;
  htmlHash: string;
  channel: string;
}

type TopRow = [string, number];

export function multiplier(subscribed: boolean, friends: number): number {
  const tenths = 10 + (subscribed ? 1 : 0) + Math.min(Math.max(Math.floor(friends), 0), MAX_FRIENDS);
  return tenths / 10;
}

export function finalScore(raw: number, k: number): number {
  return Math.round(raw * Math.round(k * 10) / 10);
}

export function parseScore(data: string): number | null {
  return /^e:\d{1,4}$/.test(data) ? Number(data.slice(2)) : null;
}

export function plausible(raw: number, elapsedMs: number): boolean {
  if (!Number.isInteger(raw) || raw < 0 || elapsedMs < 0 || elapsedMs > RUN_MAX_MS) return false;
  return raw <= Math.floor(elapsedMs / MIN_GATE_MS) + 2;
}

const bytes = (s: string) => new TextEncoder().encode(s).length;

function cleanName(name: string): string {
  const cut = [...String(name ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, "").trim()].slice(0, NAME_LEN).join("").trim();
  return cut || "Игрок";
}

const topRows = (rows: { name: string; best: number }[]): TopRow[] => rows.slice(0, 10).map((r) => [cleanName(r.name), r.best]);

function payload(rev: number, t: TopRow[]): string {
  let s = JSON.stringify({ r: rev, t });
  // Unreachable with 16-character names, but public_data over the limit would be refused outright.
  while (bytes(s) > LIMIT_BYTES && t.length) s = JSON.stringify({ r: rev, t: (t = t.slice(0, -1)) });
  return s;
}

export function topPayload(rev: number, rows: { name: string; best: number }[]): string {
  return payload(rev, topRows(rows));
}

const widgetKey = (d: Deps) => "widget:" + d.htmlHash;

async function currentTop(d: Deps): Promise<{ t: TopRow[]; rev: number }> {
  const saved = await d.store.getConfig("top");
  return { t: saved ? JSON.parse(saved) : [], rev: Number(await d.store.getConfig("rev")) || 0 };
}

/** Pushes the saved top into the shared widget, at most once a second; failures are retried later. */
async function pushTop(d: Deps, top: { t: TopRow[]; rev: number }): Promise<void> {
  const widgetId = await d.store.getConfig(widgetKey(d));
  if (!widgetId) return void await d.store.setConfig("dirty", "0");
  if (d.now() - (Number(await d.store.getConfig("edited_at")) || 0) < EDIT_GAP_MS) return void await d.store.setConfig("dirty", "1");
  try {
    await d.tg.call("editSharedWidgetData", { widget_id: widgetId, public_data: payload(top.rev, top.t) });
  } catch (e) {
    if (!/not modified/i.test(String((e as Error)?.message))) {
      console.error("editSharedWidgetData failed:", (e as Error)?.message);
      return void await d.store.setConfig("dirty", "1");
    }
  }
  await d.store.setConfig("edited_at", String(d.now()));
  await d.store.setConfig("dirty", "0");
}

/** Recomputes the top ten after a result; bumps the revision and publishes only when it changed. */
async function syncTop(d: Deps): Promise<{ t: TopRow[]; rev: number }> {
  const t = topRows(await d.store.top10());
  const body = JSON.stringify(t);
  let rev = Number(await d.store.getConfig("rev")) || 0;
  const changed = body !== (await d.store.getConfig("top") ?? "[]");
  if (changed) {
    rev++;
    await d.store.setConfig("top", body);
    await d.store.setConfig("rev", String(rev));
  }
  const top = { t, rev };
  if (changed || (await d.store.getConfig("dirty")) === "1") await pushTop(d, top);
  return top;
}

async function flushIfDirty(d: Deps): Promise<void> {
  if ((await d.store.getConfig("dirty")) === "1") await pushTop(d, await currentTop(d));
}

async function isSubscribed(d: Deps, userId: number): Promise<boolean> {
  try {
    const m = await d.tg.call("getChatMember", { chat_id: d.channel, user_id: userId });
    return ["creator", "administrator", "member"].includes(m?.status) || (m?.status === "restricted" && m?.is_member === true);
  } catch (e) {
    // Usually: the bot is not an administrator of the channel. The score is still recorded, without the bonus.
    console.error("getChatMember failed:", (e as Error)?.message);
    return false;
  }
}

// The bot's real @username, asked from Telegram once per running instance. Invite links are built from it,
// so it must never be typed in by hand: a wrong name gives "user not found" for everyone invited.
const names = new WeakMap<Tg, string>();
async function botUsername(d: Deps): Promise<string> {
  let name = names.get(d.tg);
  if (!name) {
    try {
      name = String((await d.tg.call("getMe", {}))?.username ?? "");
      if (name) names.set(d.tg, name);
    } catch (e) {
      console.error("getMe failed:", (e as Error)?.message);
    }
  }
  return name ?? "";
}

const touch = (d: Deps, from: any) => d.store.upsertPlayer(from.id, String(from.first_name ?? ""), from.username ?? null, null);

async function standing(d: Deps, userId: number) {
  const [subscribed, friends] = await Promise.all([isSubscribed(d, userId), d.store.friendsCount(userId)]);
  return { subscribed, friends, k: multiplier(subscribed, friends) };
}

async function route(q: any, d: Deps): Promise<Record<string, unknown>> {
  const id: number = q.from.id;
  const data: string = typeof q.data === "string" ? q.data : "";

  if (data === "i") {
    await touch(d, q.from);
    await flushIfDirty(d);
    const [st, player, u] = await Promise.all([standing(d, id), d.store.getPlayer(id), botUsername(d)]);
    const best = player?.best ?? 0;
    return { k: st.k, b: best, p: best > 0 ? player!.place : 0, f: Math.min(st.friends, MAX_FRIENDS), s: st.subscribed ? 1 : 0, u };
  }

  if (data === "s") {
    await touch(d, q.from);
    await d.store.startRun(id, d.now());
    await flushIfDirty(d);
    return {};
  }

  if (data.startsWith("e:")) {
    const raw = parseScore(data);
    if (raw === null) return { err: "bad" };
    const startedAt = await d.store.takeRun(id);
    if (startedAt === null) return { err: "run" };
    if (!plausible(raw, d.now() - startedAt)) return { err: "sus" };
    await touch(d, q.from);
    const { k } = await standing(d, id);
    const v = finalScore(raw, k);
    const { best, place } = await d.store.submit(id, v, d.now());
    const top = await syncTop(d);
    return { v, k, b: best, p: best > 0 ? place : 0, t: top.t, r: top.rev };
  }

  return { err: "bad" };
}

async function onQuery(q: any, d: Deps): Promise<void> {
  let answer = '{"err":"srv"}';
  try {
    const result = await route(q, d);
    answer = JSON.stringify(result);
    if (bytes(answer) > LIMIT_BYTES) answer = JSON.stringify({ ...result, t: [] });
  } catch (e) {
    console.error("widget_query failed:", (e as Error)?.message);
  }
  try {
    await d.tg.call("answerWidgetQuery", { widget_query_id: q.id, data: answer });
  } catch (e) {
    console.error("answerWidgetQuery failed:", (e as Error)?.message);
  }
}

async function onStart(m: any, arg: string | undefined, d: Deps): Promise<void> {
  const id: number = m.from.id;
  let referrer: number | null = null;
  const ref = /^r(\d{1,15})$/.exec(arg ?? "");
  if (ref && Number(ref[1]) !== id && await d.store.getPlayer(Number(ref[1]))) referrer = Number(ref[1]);
  await d.store.upsertPlayer(id, String(m.from.first_name ?? ""), m.from.username ?? null, referrer);

  const widgetId = await d.store.getConfig(widgetKey(d));
  if (widgetId) {
    try {
      await d.tg.call("sendSharedWidget", { chat_id: m.chat.id, widget_id: widgetId, caption: CAPTION });
      return;
    } catch (e) {
      // The saved widget is gone or unusable: fall through and create a new one, so the player still gets a game.
      console.error("sendSharedWidget failed:", (e as Error)?.message);
    }
  }
  // First /start for this build of the game: this send creates the shared widget everyone else will get.
  const top = await currentTop(d);
  const sent = await d.tg.call("sendWidget", {
    chat_id: m.chat.id,
    html: d.html,
    width: 340,
    height: 440,
    public_data: payload(top.rev, top.t),
    caption: CAPTION,
    allow_queries: true,
    is_shared: true,
  });
  if (sent?.widget?.id) await d.store.setConfig(widgetKey(d), String(sent.widget.id));
}

export async function handleUpdate(update: any, d: Deps): Promise<void> {
  const q = update?.widget_query;
  if (q?.id && q.from?.id) return onQuery(q, d);
  const m = update?.message;
  if (m?.chat?.type !== "private" || typeof m.text !== "string" || !m.from?.id || m.from.is_bot) return;
  const start = /^\/start(?:@\w+)?(?:\s+(\S+))?$/.exec(m.text.trim());
  if (start) await onStart(m, start[1], d);
}

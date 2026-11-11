import { type Deps, handleUpdate, type Tg } from "./core.ts";

const SECRET_HEADER = "x-telegram-bot-api-secret-token";

/**
 * The webhook secret is derived from the bot token, so the owner manages one secret instead of two.
 * HMAC keeps it one-way: knowing the webhook secret does not reveal the token.
 */
export async function deriveSecret(token: string): Promise<string> {
  if (!token) return "";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(token), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode("portal-game-webhook")));
  return [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sameSecret(got: string, want: string): boolean {
  if (!want || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

/** Points the bot's webhook at this function and reports whether the bot can check channel subscriptions. */
export async function setupWebhook(tg: Tg, url: string, secret: string, channel: string): Promise<string> {
  await tg.call("setWebhook", { url, secret_token: secret, allowed_updates: ["message", "widget_query"] });
  const me = await tg.call("getMe", {});
  let admin = false;
  try {
    admin = (await tg.call("getChatMember", { chat_id: channel, user_id: me.id }))?.status === "administrator";
  } catch {
    // Not a member of the channel at all.
  }
  return [
    `Вебхук установлен для @${me.username}.`,
    `Бот — администратор канала ${channel}: ${admin ? "да" : "НЕТ"}`,
    admin ? "Всё готово: отправьте боту /start." : "Игра работает, но бонус за подписку не начисляется, пока бот не станет администратором канала.",
  ].join("\n");
}

/** One line for a plain GET: which build is deployed, and whether the embedded widget survived deployment intact. */
export async function healthLine(html: string, expectedHash: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(html)));
  const actual = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
  return actual === expectedHash ? `portal-game ${expectedHash} ok` : `portal-game CORRUPT: widget hash ${actual}, expected ${expectedHash}`;
}

const text = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function handleRequest(req: Request, deps: Deps, opts: { secret: string; setup: () => Promise<string>; health: string }): Promise<Response> {
  if (req.method === "GET" && new URL(req.url).pathname.endsWith("/setup")) {
    // Safe to leave open: it can only re-point the webhook at this same function.
    try {
      return text(await opts.setup());
    } catch (e) {
      return text(`Не получилось: ${(e as Error)?.message}`, 500);
    }
  }
  if (req.method === "GET") return text(opts.health);
  if (req.method !== "POST") return text("method not allowed", 405);
  if (!sameSecret(req.headers.get(SECRET_HEADER) ?? "", opts.secret)) return text("unauthorized", 401);
  try {
    await handleUpdate(await req.json(), deps);
  } catch (e) {
    // Always 200: a failing update must not make Telegram redeliver it for hours.
    console.error("update failed:", (e as Error)?.message);
  }
  return text("ok");
}

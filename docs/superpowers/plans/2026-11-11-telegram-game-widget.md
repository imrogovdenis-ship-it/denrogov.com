# Telegram Game Widget (@portalvr) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tap-to-fly arcade game delivered as a Bot API 10.4 HTML widget by @portalvr, with a top-10 leaderboard, per-player rank, and score multipliers for invited friends and channel subscription.

**Architecture:** A single canvas widget (≤ 4096 bytes after zlib-9) talks to the bot only through `TelegramWidget.request`. The bot is one Supabase Edge Function webhook whose logic lives in runtime-neutral TypeScript modules (tested under Node with fakes); Postgres tables hold players, runs and config. The top-10 lives in the shared widget's `public_data`.

**Tech Stack:** Vanilla JS + canvas 2D, Node 22 (`node --test`, built-in type stripping), terser, Playwright (preinstalled), Supabase Edge Functions (Deno), Postgres.

**Spec:** `docs/superpowers/specs/2026-11-11-telegram-game-widget-design.md`

## Global Constraints

- Built widget HTML: ≤ 32768 bytes UTF-8 and ≤ 4096 bytes after `zlib` level 9. The build fails otherwise.
- Widget runs in QuickJS: no network, no keyboard, no canvas shadows / `globalCompositeOperation` / filters, system fonts only, no `vh`.
- Request data 1–64 bytes; answers and `public_data` ≤ 1024 bytes UTF-8.
- One request per tap, one in flight; background requests only in the private chat.
- `k = 1 + 0.1·subscribed + 0.1·min(friends, 15)`; `final = Math.round(raw · k)`; max ×2.6.
- Channel `@portal_vr_news`; bot username `portalvr`; referral start parameter `r<user_id>`.
- No leaderboard threshold; names in the top are cut to 16 characters.
- Secrets (`BOT_TOKEN`, `WEBHOOK_SECRET`) never enter the repository.
- All new code lives under `telegram-game/`; the site and its deploy are untouched.
- Original artwork only; working title «Portal Flight».

## Review Focus

- A `widget_query` arrives twice or `e` arrives without a prior `s` → the bot answers `{"err":"run"}` and records nothing.
- `e:` carries garbage (`e:abc`, `e:-5`, `e:1e9`, `e:3.7`) → rejected with `{"err":"bad"}`, never written.
- `getChatMember` fails (bot not admin) → score still recorded, subscription bonus 0.
- A player's name is long, Cyrillic, or contains emoji/quotes → `public_data` stays valid JSON ≤ 1024 bytes.
- `editSharedWidgetData` fails (flood wait / not modified) → the query is still answered and the top is retried on a later query.

---

### Task 1: Game logic

**Files:**
- Create: `telegram-game/package.json` (`"type":"module"`, script `"test":"node --test tests/"`)
- Create: `telegram-game/widget/game.js`
- Test: `telegram-game/tests/game.test.js`

**Interfaces:**
- Produces (ES module, no DOM access):
  - Constants `W=340, H=440, BIRD_X=90, BIRD_R=12, GATE_W=46, GAP=140, SPACING=190, SPEED0=120, SPEED_MAX=220, SPEED_STEP=3, GRAVITY=1100, FLAP_V=-340`, and `MIN_GATE_MS = Math.floor(SPACING / SPEED_MAX * 1000)` (863).
  - `newGame(rand: () => number): State` — `State = {y, v, speed, score, dead, gates: [{x, gapY, passed}]}`; first gate at `x = W + 80`.
  - `flap(s: State): void` — sets `v = FLAP_V` unless dead.
  - `step(s: State, dt: number, rand): void` — `dt` in seconds, clamped to 0.05; moves bird and gates, spawns gates `SPACING` apart, removes off-screen ones, increments `score` and `speed` (up to `SPEED_MAX`) when a gate's right edge passes `BIRD_X`, sets `dead` on floor/ceiling or gate-cube collision (circle vs. the two rectangles).

- [ ] **Step 1: Write failing tests** in `tests/game.test.js`:
  - `newGame` starts alive with score 0 and one gate ahead.
  - without flapping the bird hits the floor: after stepping 3 s in 1/60 steps, `dead === true`.
  - `flap` gives upward velocity `FLAP_V`; flapping when dead changes nothing.
  - a bird held at the gap centre (set `s.y = gate.gapY`, `s.v = 0` before each step) passes the first gate: `score === 1` and `speed === SPEED0 + SPEED_STEP`.
  - a bird held at `gapY + GAP` when the gate reaches it dies.
  - `speed` never exceeds `SPEED_MAX` after 100 gates passed the same way.
  - `MIN_GATE_MS === 863`.
  - `step` with `dt = 5` behaves as `dt = 0.05` (no tunnelling).
- [ ] **Step 2: Run** `cd telegram-game && npm test` — expect failures (module missing).
- [ ] **Step 3: Implement `widget/game.js`.**
- [ ] **Step 4: Run** `npm test` — expect all pass.
- [ ] **Step 5: Commit** `feat(game): flight physics and scoring`.

### Task 2: Bot core logic

**Files:**
- Create: `telegram-game/supabase/functions/portal-game/core.ts`
- Test: `telegram-game/tests/core.test.js`, `telegram-game/tests/fakes.js`

**Interfaces:**
- Consumes: `MIN_GATE_MS` value from Task 1 (duplicated as a constant; a test asserts equality with `widget/game.js`).
- Produces (erasable-syntax TypeScript only, no Deno/npm imports, so Node runs it directly):
  - `multiplier(subscribed: boolean, friends: number): number` — rounded to one decimal.
  - `finalScore(raw: number, k: number): number`.
  - `parseScore(data: string): number | null` — accepts only `e:` + 1–4 digits.
  - `plausible(raw: number, elapsedMs: number): boolean` — false if `elapsedMs < 0`, `elapsedMs > 30*60*1000`, or `raw > Math.floor(elapsedMs / MIN_GATE_MS) + 2`.
  - `topPayload(rev: number, rows: {name: string, best: number}[]): string` — `{"r":rev,"t":[[name16,best],…]}`; cuts names by code point to 16.
  - `interface Store { upsertPlayer(id, name, username, referrerId: number|null): Promise<{isNew: boolean}>; startRun(id, nowMs): Promise<void>; takeRun(id): Promise<number|null>; friendsCount(id): Promise<number>; submit(id, final, nowMs): Promise<{best: number, place: number}>; getPlayer(id): Promise<{best: number, place: number}|null>; top10(): Promise<{id: number, name: string, best: number}[]>; getConfig(key): Promise<string|null>; setConfig(key, value): Promise<void> }`
  - `interface Tg { call(method: string, params: object): Promise<any> }` (throws on API error).
  - `interface Deps { store: Store; tg: Tg; now: () => number; html: string; htmlHash: string; channel: string; botUsername: string }`
  - `handleUpdate(update: any, deps: Deps): Promise<void>` — routes `message` with `/start [r<id>]` in a private chat and `widget_query`; ignores everything else. Every `widget_query` is answered exactly once via `answerWidgetQuery`, including on internal errors (`{"err":"srv"}`).
- Behaviour pinned by the spec:
  - `/start`: `upsertPlayer` (referrer only when the player is new, the id differs from their own, and the referrer exists per `getPlayer`); then `sendSharedWidget` with `widget_id` from config key `widget:<htmlHash>`; if absent, `sendWidget` with `html, width: 340, height: 440, is_shared: true, allow_queries: true, public_data` (current top) and store the returned `widget.id`. Caption (Russian): `Portal Flight — тапай, чтобы лететь. Имя из профиля увидят другие, если попадёшь в топ-10.`
  - `i`: answer `{k, b, p, f, s}`.
  - `s`: `startRun`; answer `{}`.
  - `e:<n>`: `takeRun` → null ⇒ `{"err":"run"}`; unparsable ⇒ `{"err":"bad"}`; implausible ⇒ `{"err":"sus"}`; else `submit` and answer `{v, k, b, p, t, r}` where `t` is the top-10 array and `r` its revision.
  - Subscription: `getChatMember(channel, user)`; statuses `creator|administrator|member`, or `restricted` with `is_member`, count; any thrown error ⇒ not subscribed.
  - Top sync after `submit` and at the start of every query when config `dirty` is `1`: if the rows differ from config `top`, bump `rev`, store, and call `editSharedWidgetData` only if `now - edited_at ≥ 1000`; on skip or thrown error set `dirty=1`, on success `dirty=0`. Treat an error containing `not modified` as success.

- [ ] **Step 1: Write `tests/fakes.js`** — in-memory `Store` (Map-based, `place` = players with greater best + 1, ties by earlier time) and a recording `Tg` whose per-method responses/errors are configurable.
- [ ] **Step 2: Write failing tests** in `tests/core.test.js`:
  - `multiplier`: `(false,0)→1`, `(true,0)→1.1`, `(true,3)→1.4`, `(false,15)→2.5`, `(true,40)→2.6`.
  - `finalScore(37,1.2)===44`.
  - `parseScore`: `e:12→12`; `e:abc`, `e:-5`, `e:1e9`, `e:3.7`, `e:`, `e:12345`, `x:1` → `null`.
  - `plausible(10, 10*863)` true; `plausible(13, 10*863)` false; `plausible(1, 31*60*1000)` false; `plausible(0, -1)` false.
  - `core.MIN_GATE_MS === game.MIN_GATE_MS`.
  - `topPayload` with ten rows of 40-char Cyrillic+emoji+quote names is valid JSON, ≤ 1024 bytes, names 16 code points.
  - `/start` first time sends `sendWidget` with `is_shared` and `allow_queries` and stores the id; second `/start` uses `sendSharedWidget`.
  - `/start r<self>` and `/start r<unknown>` set no referrer; `/start r<known>` from a new player sets it; a returning player's referrer never changes.
  - friend counts only after the invited player's first `s`.
  - full run: `s` then (advance fake clock 20 s) `e:10` with 1 friend and subscription → answer `v=12, k=1.2`, `p=1`, and `editSharedWidgetData` called with payload containing the player.
  - `e` without `s` → `{"err":"run"}`; second `e` after one `s` → `{"err":"run"}`; `e:50` one second after `s` → `{"err":"sus"}`; none of them changes the store.
  - `getChatMember` throwing → score recorded with `k` lacking the 0.1.
  - `editSharedWidgetData` throwing → query still answered, `dirty` becomes `1`, next `i` retries and clears it.
  - a store method throwing → `answerWidgetQuery` called once with `{"err":"srv"}`.
  - updates of other kinds, `/start` in a group, and `widget_query` with unknown data make no store writes.
- [ ] **Step 3: Run** `npm test` — expect failures.
- [ ] **Step 4: Implement `core.ts`.**
- [ ] **Step 5: Run** `npm test` — expect all pass.
- [ ] **Step 6: Commit** `feat(bot): leaderboard, multipliers and anti-cheat core`.

### Task 3: Widget UI, protocol client and size-budgeted build

**Files:**
- Create: `telegram-game/widget/widget.html` (markup + CSS + UI script with a `/*GAME*/` placeholder)
- Create: `telegram-game/build/build.mjs`
- Create: `telegram-game/dist/widget.html` (build output, committed), `telegram-game/supabase/functions/portal-game/widget.generated.ts` (exports `HTML` and `HTML_HASH`)
- Test: `telegram-game/tests/build.test.js`, `telegram-game/tests/widget.browser.test.js`
- Modify: `telegram-game/package.json` (devDependency `terser`; scripts `build`, `test` runs build first)

**Interfaces:**
- Consumes: `widget/game.js` (inlined with `export` keywords stripped); protocol from Task 2 (`i`, `s`, `e:<n>` and their answers; `public_data` shape `{r, t}`).
- Produces: `widget.generated.ts` exporting `HTML: string`, `HTML_HASH: string` (first 12 hex chars of SHA-256).
- UI decisions:
  - Screens start / play / over drawn on one `<canvas width=340 height=440>`; the over screen uses HTML buttons below/over the canvas inside the same 340×440 box.
  - Bird: circle body, wing, beak, and glasses (two outlined lenses + bridge). Gates: stacked cubes, one neon colour above and another below (e.g. `#ff2d6f`, `#19d3ff`), each with a chevron arrow; dark background set on `body`.
  - Buttons (Russian): `Ещё раз`, `Позвать друга`, `Подписаться`, and `Узнать место` only when the automatic `e` request was rejected.
  - Share link: `https://t.me/share/url?url=` + encoded `https://t.me/portalvr?start=r<viewer.id>` via `openTelegramLink`; subscribe opens `https://t.me/portal_vr_news`.
  - Requests: `i` at script start (background); `s` in the pointerdown handler that starts a run; `e:<score>` right after death, falling back to the `Узнать место` tap on `NOT_ALLOWED`/`RATE_LIMITED`/`BUSY`.
  - Over screen shows `raw × k = final`, best, `Твоё место: N`, and the top-10 with the viewer's row highlighted (matched by name and score, since ids are not in `public_data`).
  - `watchPublicData()` + `publicDataChanged`; ignore revisions older than the newest seen (also from answers).
  - Cache `k`, best and place in `localStorage` inside `try/catch`.
  - Pause the loop on `deactivated` / `document.hidden`; with `prefers-reduced-motion` skip decorative animation only.
  - When `window.TelegramWidget` is undefined the game is fully playable and shows no leaderboard.
- Build: inline game into the placeholder, minify JS with terser (`toplevel`, `mangle`, `compress` with 2 passes, ecma 2020), collapse CSS/HTML whitespace, write outputs, print raw and compressed sizes, exit non-zero if raw > 32768 or `zlib.deflateSync(html, {level: 9}).length > 4096`.

- [ ] **Step 1: Write failing `tests/build.test.js`:** after running the build, `dist/widget.html` exists, contains no `\0`, raw ≤ 32768, deflate-9 ≤ 4096, contains no `fetch(`, `src=`, `http://`; `widget.generated.ts` `HTML` equals the dist file and `HTML_HASH` matches.
- [ ] **Step 2: Write failing `tests/widget.browser.test.js`** (node:test + Playwright Chromium, page loaded from `dist/widget.html` via `setContent`, with an injected `TelegramWidget` mock that records `request` calls and resolves scripted answers):
  - on load the mock received request `i`.
  - a pointerdown on the canvas sends `s` and the bird moves (canvas pixels change between two frames).
  - with no further taps the game ends and `e:0` is sent; the over screen text contains the scripted place (`Твоё место: 35`).
  - when the mock rejects `e` with `RATE_LIMITED`, the `Узнать место` button appears and tapping it sends `e:0`.
  - emitting `publicDataChanged` with a newer revision redraws the table; an older revision is ignored.
  - tapping `Позвать друга` calls `openTelegramLink` with a URL containing `start%3Dr<id>` and ≤ 256 chars.
  - without the mock the page plays a run and throws no page errors.
- [ ] **Step 3: Run** `npm test` — expect failures.
- [ ] **Step 4: Implement `widget.html` and `build.mjs`.** If the budget is exceeded, cut decoration (cube detail, start-screen art) before any mechanic, and record what was cut in the commit message.
- [ ] **Step 5: Run** `npm test` — expect all pass; note the printed compressed size.
- [ ] **Step 6: Take a 2× screenshot of each screen** with Playwright into the scratchpad and inspect it.
- [ ] **Step 7: Commit** `feat(widget): game UI, bot protocol and 4 KB build`.

### Task 4: Database, webhook entry and deployment

**Files:**
- Create: `telegram-game/supabase/migrations/20261111000000_flap.sql`
- Create: `telegram-game/supabase/functions/portal-game/store.ts`, `tg.ts`, `index.ts`
- Create: `telegram-game/README.md`
- Test: `telegram-game/tests/entry.test.js`

**Interfaces:**
- Consumes: `handleUpdate`, `Store`, `Tg`, `Deps` (Task 2); `HTML`, `HTML_HASH` (Task 3).
- Produces:
  - SQL: tables `flap_players(user_id bigint pk, name text, username text, best int default 0, best_at timestamptz, referred_by bigint, played boolean default false, created_at timestamptz default now())`, `flap_runs(user_id bigint pk, started_at timestamptz)`, `flap_config(key text pk, value text)`; RLS enabled on all three with no policies; functions `flap_upsert_player`, `flap_start_run`, `flap_take_run` (delete … returning), `flap_submit` (raises best only if greater, returns best and place), `flap_place`, each `security definer` with `search_path = public`, `execute` revoked from `public, anon, authenticated` and granted to `service_role`.
  - `tg.ts`: `makeTg(token: string, fetchFn = fetch): Tg` — POST JSON to `https://api.telegram.org/bot<token>/<method>`, throws `Error(description)` when `ok` is false.
  - `store.ts`: `makeStore(client): Store` over supabase-js `rpc`/`from`.
  - `index.ts`: `handleRequest(req: Request, deps, secret: string): Promise<Response>` exported for tests — 405 for non-POST, 401 unless header `X-Telegram-Bot-Api-Secret-Token` equals `secret` (and `secret` is non-empty), 200 `ok` otherwise even if `handleUpdate` throws (logged); plus `Deno.serve` wiring guarded by `typeof Deno !== "undefined"`, reading `BOT_TOKEN`, `WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Step 1: Write failing `tests/entry.test.js`:** GET → 405; missing/wrong secret → 401 and `handleUpdate` deps untouched; empty configured secret → 401; correct secret with a `/start` update → 200 and the fake `Tg` saw a send; invalid JSON body → 200; `makeTg` posts to the right URL and throws the API `description` on `ok:false`.
- [ ] **Step 2: Run** `npm test` — expect failures.
- [ ] **Step 3: Implement `tg.ts`, `store.ts`, `index.ts` and the migration.**
- [ ] **Step 4: Run** `npm test` — expect all pass.
- [ ] **Step 5: Apply the migration** to project `oxsmllzxalxriiwgwpna`; verify with SQL in one transaction that is rolled back: upsert two players, start/take a run (second take returns null), submit 10 then 5 (best stays 10), places 1 and 2, tie broken by earlier `best_at`. Run the security advisors and resolve anything they report for the `flap_*` objects.
- [ ] **Step 6: Deploy the function** `portal-game` with JWT verification off; confirm an unauthenticated POST without the secret header returns 401.
- [ ] **Step 7: Write `README.md`** (Russian, for the owner): generate a webhook secret, set `BOT_TOKEN` and `WEBHOOK_SECRET` in Supabase secrets, make @portalvr an admin of @portal_vr_news, the exact `setWebhook` command with `secret_token` and `allowed_updates=["message","widget_query"]`, how to check with `getWebhookInfo`, how to ship a new game version (rebuild + redeploy; old messages keep the old widget), how to remove a cheater's row.
- [ ] **Step 8: Commit and push** `feat(bot): Supabase webhook, schema and owner guide`.

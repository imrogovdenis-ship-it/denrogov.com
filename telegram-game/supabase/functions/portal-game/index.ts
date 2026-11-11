// Supabase Edge Function: Telegram webhook for the Portal Flight widget.
import { createClient } from "npm:@supabase/supabase-js@2";
import type { Deps } from "./core.ts";
import { deriveSecret, handleRequest, healthLine, setupWebhook } from "./handler.ts";
import { makeStore } from "./store.ts";
import { makeTg } from "./tg.ts";
import { HTML, HTML_HASH } from "./widget.generated.ts";

const CHANNEL = "@portal_vr_news";
const BOT_USERNAME = "portalvr";

const token = Deno.env.get("BOT_TOKEN") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
const tg = makeTg(token);
const deps: Deps = { store: makeStore(db), tg, now: () => Date.now(), html: HTML, htmlHash: HTML_HASH, channel: CHANNEL, botUsername: BOT_USERNAME };
const secret = await deriveSecret(token);
const health = await healthLine(HTML, HTML_HASH);

Deno.serve((req) =>
  handleRequest(req, deps, {
    secret,
    health,
    setup: () => {
      if (!token) throw new Error("секрет BOT_TOKEN не задан в настройках функции");
      return setupWebhook(tg, `${supabaseUrl}/functions/v1/portal-game`, secret, CHANNEL);
    },
  })
);

import type { Store } from "./core.ts";

/** The part of the supabase-js client this module uses. */
export interface Db {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: any; error: { message: string } | null }>;
  from(table: string): any;
}

/** Postgres-backed storage. All game logic lives in core.ts; the SQL is in supabase/migrations. */
export function makeStore(db: Db): Store {
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };
  const iso = (ms: number) => new Date(ms).toISOString();
  const standing = (rows: any) => rows?.[0] ? { best: Number(rows[0].best), place: Number(rows[0].place) } : null;

  return {
    async upsertPlayer(id, name, username, referrerId) {
      return { isNew: Boolean(await rpc("flap_upsert_player", { p_id: id, p_name: name, p_username: username, p_ref: referrerId })) };
    },
    async startRun(id, nowMs) {
      await rpc("flap_start_run", { p_id: id, p_at: iso(nowMs) });
    },
    async takeRun(id) {
      const startedAt = await rpc("flap_take_run", { p_id: id });
      return startedAt ? Date.parse(startedAt) : null;
    },
    async friendsCount(id) {
      return Number(await rpc("flap_friends", { p_id: id })) || 0;
    },
    async submit(id, final, nowMs) {
      const row = standing(await rpc("flap_submit", { p_id: id, p_final: final, p_at: iso(nowMs) }));
      if (!row) throw new Error("flap_submit: player not found");
      return row;
    },
    async getPlayer(id) {
      return standing(await rpc("flap_player", { p_id: id }));
    },
    async top10() {
      return ((await rpc("flap_top", {})) ?? []).map((r: any) => ({ id: Number(r.id), name: String(r.name), best: Number(r.best) }));
    },
    async getConfig(key) {
      const { data, error } = await db.from("flap_config").select("value").eq("key", key).maybeSingle();
      if (error) throw new Error(`flap_config: ${error.message}`);
      return data ? String(data.value) : null;
    },
    async setConfig(key, value) {
      const { error } = await db.from("flap_config").upsert({ key, value });
      if (error) throw new Error(`flap_config: ${error.message}`);
    },
  };
}

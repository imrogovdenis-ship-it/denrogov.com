// In-memory stand-ins for the database and the Bot API.
export function fakeStore() {
  const players = new Map();
  const runs = new Map();
  const config = new Map();
  let writes = 0;
  let failNext = null;
  const guard = (name) => { if (failNext === name) { failNext = null; throw new Error('db down'); } };
  const place = (p) => [...players.values()].filter((o) => o.best > p.best || (o.best === p.best && o.bestAt < p.bestAt)).length + 1;
  return {
    players, runs, config,
    get writes() { return writes; },
    failOn(name) { failNext = name; },
    async upsertPlayer(id, name, username, referrerId) {
      guard('upsertPlayer'); writes++;
      const old = players.get(id);
      if (old) { old.name = name; old.username = username; return { isNew: false }; }
      players.set(id, { id, name, username, best: 0, bestAt: Infinity, referredBy: referrerId, played: false });
      return { isNew: true };
    },
    async startRun(id, nowMs) { guard('startRun'); writes++; runs.set(id, nowMs); const p = players.get(id); if (p) p.played = true; },
    async takeRun(id) { guard('takeRun'); const t = runs.get(id); if (t === undefined) return null; writes++; runs.delete(id); return t; },
    async friendsCount(id) { return [...players.values()].filter((p) => p.referredBy === id && p.played).length; },
    async submit(id, final, nowMs) {
      guard('submit'); writes++;
      const p = players.get(id);
      if (final > p.best) { p.best = final; p.bestAt = nowMs; }
      return { best: p.best, place: place(p) };
    },
    async getPlayer(id) { const p = players.get(id); return p ? { best: p.best, place: place(p) } : null; },
    async top10() {
      return [...players.values()].filter((p) => p.best > 0)
        .sort((a, b) => b.best - a.best || a.bestAt - b.bestAt).slice(0, 10)
        .map((p) => ({ id: p.id, name: p.name, best: p.best }));
    },
    async getConfig(key) { return config.has(key) ? config.get(key) : null; },
    async setConfig(key, value) { config.set(key, String(value)); },
  };
}

export function fakeTg(overrides = {}) {
  const calls = [];
  const handlers = {
    sendWidget: () => ({ message_id: 1, widget: { id: 'W1' } }),
    sendSharedWidget: () => ({ message_id: 2 }),
    answerWidgetQuery: () => true,
    editSharedWidgetData: () => true,
    getChatMember: () => ({ status: 'left' }),
    getMe: () => ({ id: 5, username: 'portal_vr_bot' }),
    ...overrides,
  };
  return {
    calls, handlers,
    of(method) { return calls.filter((c) => c.method === method).map((c) => c.params); },
    async call(method, params) {
      calls.push({ method, params });
      if (!handlers[method]) throw new Error('unexpected method ' + method);
      return handlers[method](params);
    },
  };
}

export function makeDeps(tgOverrides) {
  const clock = { t: 1_000_000 };
  const store = fakeStore();
  const tg = fakeTg(tgOverrides);
  const deps = { store, tg, now: () => clock.t, html: '<b>game</b>', htmlHash: 'abc123', channel: '@portal_vr_news' };
  return { deps, store, tg, clock };
}

export const user = (id, first_name = 'User' + id) => ({ id, is_bot: false, first_name, username: 'u' + id });
export const startMsg = (id, arg, name) => ({ message: { message_id: 5, from: user(id, name), chat: { id, type: 'private' }, text: arg ? `/start ${arg}` : '/start' } });
let qid = 0;
export const query = (id, data, name) => ({ widget_query: { id: 'q' + ++qid, from: user(id, name), chat: { id, type: 'private' }, message_id: 9, chat_instance: 'ci', widget_id: 'W1', type: { type: 'data' }, data } });

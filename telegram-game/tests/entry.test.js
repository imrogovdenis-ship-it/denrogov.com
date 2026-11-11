import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, deriveSecret, setupWebhook, healthLine } from '../supabase/functions/portal-game/handler.ts';
import { makeTg } from '../supabase/functions/portal-game/tg.ts';
import { makeStore } from '../supabase/functions/portal-game/store.ts';
import { makeDeps, startMsg, fakeTg } from './fakes.js';

const URL_ = 'https://example.supabase.co/functions/v1/portal-game';
const post = (body, secret) => new Request(URL_, {
  method: 'POST',
  headers: secret === undefined ? {} : { 'X-Telegram-Bot-Api-Secret-Token': secret },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const opts = (secret = 'S3cret', setup = async () => 'done') => ({ secret, setup, health: 'portal-game abc123 ok' });

test('only POST is accepted for updates; a plain GET shows the build', async () => {
  const { deps, tg } = makeDeps();
  assert.equal((await handleRequest(new Request(URL_, { method: 'PUT' }), deps, opts())).status, 405);
  const res = await handleRequest(new Request(URL_), deps, opts());
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'portal-game abc123 ok');
  assert.equal(tg.calls.length, 0);
});

test('healthLine flags a widget whose text does not match its hash', async () => {
  const gen = await import('../supabase/functions/portal-game/widget.generated.ts');
  assert.equal(await healthLine(gen.HTML, gen.HTML_HASH), `portal-game ${gen.HTML_HASH} ok`);
  assert.match(await healthLine(gen.HTML + ' ', gen.HTML_HASH), /CORRUPT/);
});

test('a missing or wrong secret is rejected before anything runs', async () => {
  const { deps, tg, store } = makeDeps();
  for (const secret of [undefined, '', 'wrong', 'S3cretX', 's3cret']) {
    const res = await handleRequest(post(startMsg(1), secret), deps, opts());
    assert.equal(res.status, 401, String(secret));
  }
  assert.equal(tg.calls.length, 0);
  assert.equal(store.writes, 0);
});

test('an unconfigured secret rejects everything, even an empty header', async () => {
  const { deps, tg } = makeDeps();
  assert.equal((await handleRequest(post(startMsg(1), ''), deps, opts(''))).status, 401);
  assert.equal((await handleRequest(post(startMsg(1)), deps, opts(''))).status, 401);
  assert.equal(tg.calls.length, 0);
});

test('a signed /start update is handled', async () => {
  const { deps, tg } = makeDeps();
  const res = await handleRequest(post(startMsg(1), 'S3cret'), deps, opts());
  assert.equal(res.status, 200);
  assert.equal(tg.of('sendWidget').length, 1);
});

test('bad JSON and handler failures still return 200 so Telegram does not retry forever', async () => {
  const { deps } = makeDeps({ sendWidget: () => { throw new Error('boom'); } });
  assert.equal((await handleRequest(post('{not json', 'S3cret'), deps, opts())).status, 200);
  assert.equal((await handleRequest(post(startMsg(1), 'S3cret'), deps, opts())).status, 200);
});

test('GET …/setup runs the setup and shows its report', async () => {
  const { deps } = makeDeps();
  const res = await handleRequest(new Request(URL_ + '/setup'), deps, opts('S3cret', async () => 'Вебхук установлен'));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/plain; charset=utf-8/);
  assert.equal(await res.text(), 'Вебхук установлен');
  const failed = await handleRequest(new Request(URL_ + '/setup'), deps, opts('S3cret', async () => { throw new Error('Unauthorized'); }));
  assert.equal(failed.status, 500);
  assert.match(await failed.text(), /Unauthorized/);
});

test('deriveSecret is stable, token-specific and valid for Telegram', async () => {
  const a = await deriveSecret('123:AAA');
  assert.equal(a, await deriveSecret('123:AAA'));
  assert.notEqual(a, await deriveSecret('123:AAB'));
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.ok(!a.includes('AAA'));
  assert.equal(await deriveSecret(''), '');
});

test('setupWebhook registers the webhook and reports the channel rights', async () => {
  const tg = fakeTg({ setWebhook: () => true, getMe: () => ({ id: 5, username: 'portalvr' }), getChatMember: () => ({ status: 'administrator' }) });
  const report = await setupWebhook(tg, URL_, 'S3cret', '@portal_vr_news');
  assert.deepEqual(tg.of('setWebhook'), [{ url: URL_, secret_token: 'S3cret', allowed_updates: ['message', 'widget_query'] }]);
  assert.deepEqual(tg.of('getChatMember'), [{ chat_id: '@portal_vr_news', user_id: 5 }]);
  assert.match(report, /@portalvr/);
  assert.match(report, /администратор канала @portal_vr_news: да/);

  const notAdmin = fakeTg({ setWebhook: () => true, getMe: () => ({ id: 5, username: 'portalvr' }), getChatMember: () => { throw new Error('chat not found'); } });
  assert.match(await setupWebhook(notAdmin, URL_, 'S3cret', '@portal_vr_news'), /администратор канала @portal_vr_news: НЕТ/);
});

test('makeTg posts JSON to the Bot API and unwraps the result', async () => {
  const seen = [];
  const tg = makeTg('123:AAA', async (url, init) => { seen.push([url, init]); return new Response(JSON.stringify({ ok: true, result: { message_id: 7 } })); });
  assert.deepEqual(await tg.call('sendWidget', { chat_id: 1 }), { message_id: 7 });
  assert.equal(seen[0][0], 'https://api.telegram.org/bot123:AAA/sendWidget');
  assert.equal(seen[0][1].method, 'POST');
  assert.equal(seen[0][1].headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(seen[0][1].body), { chat_id: 1 });
});

test('makeTg throws the API description without leaking the token', async () => {
  const tg = makeTg('123:AAA', async () => new Response(JSON.stringify({ ok: false, description: 'Bad Request: message is not modified' }), { status: 400 }));
  await assert.rejects(tg.call('editSharedWidgetData', {}), /message is not modified/);
  const broken = makeTg('123:AAA', async () => { throw new Error('connect failed https://api.telegram.org/bot123:AAA/x'); });
  await assert.rejects(broken.call('getMe', {}), (e) => !e.message.includes('AAA'));
});

// A stand-in for the supabase-js client: records calls and returns scripted rows.
function fakeClient(script) {
  const calls = [];
  return {
    calls,
    rpc: async (fn, args) => { calls.push([fn, args]); return script[fn] ?? { data: null, error: null }; },
    from: (table) => ({
      select: () => ({ eq: (_c, key) => ({ maybeSingle: async () => { calls.push([table, 'get', key]); return script['get:' + key] ?? { data: null, error: null }; } }) }),
      upsert: async (row) => { calls.push([table, 'set', row]); return script.set ?? { error: null }; },
    }),
  };
}

test('makeStore maps rows from the database', async () => {
  const client = fakeClient({
    flap_upsert_player: { data: true, error: null },
    flap_take_run: { data: '2026-11-11T10:00:00+00:00', error: null },
    flap_friends: { data: 3, error: null },
    flap_submit: { data: [{ best: 44, place: 35 }], error: null },
    flap_player: { data: [], error: null },
    flap_top: { data: [{ id: '9007199254740993', name: 'Аня', best: 50 }], error: null },
    'get:rev': { data: { value: '7' }, error: null },
  });
  const store = makeStore(client);
  assert.deepEqual(await store.upsertPlayer(1, 'Денис', null, 2), { isNew: true });
  assert.deepEqual(client.calls[0], ['flap_upsert_player', { p_id: 1, p_name: 'Денис', p_username: null, p_ref: 2 }]);
  await store.startRun(1, Date.parse('2026-11-11T10:00:00Z'));
  assert.deepEqual(client.calls[1], ['flap_start_run', { p_id: 1, p_at: '2026-11-11T10:00:00.000Z' }]);
  assert.equal(await store.takeRun(1), Date.parse('2026-11-11T10:00:00Z'));
  assert.equal(await store.friendsCount(1), 3);
  assert.deepEqual(await store.submit(1, 44, 0), { best: 44, place: 35 });
  assert.equal(await store.getPlayer(1), null);
  assert.deepEqual(await store.top10(), [{ id: 9007199254740993, name: 'Аня', best: 50 }].map((r) => ({ ...r, id: Number('9007199254740993') })));
  assert.equal(await store.getConfig('rev'), '7');
  assert.equal(await store.getConfig('missing'), null);
  await store.setConfig('rev', '8');
  assert.deepEqual(client.calls.at(-1), ['flap_config', 'set', { key: 'rev', value: '8' }]);
});

test('makeStore: no open run is null, and database errors throw', async () => {
  assert.equal(await makeStore(fakeClient({})).takeRun(1), null);
  const store = makeStore(fakeClient({ flap_submit: { data: null, error: { message: 'permission denied' } }, set: { error: { message: 'nope' } } }));
  await assert.rejects(store.submit(1, 1, 0), /permission denied/);
  await assert.rejects(store.setConfig('a', 'b'), /nope/);
});

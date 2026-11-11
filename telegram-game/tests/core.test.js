import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../supabase/functions/portal-game/core.ts';
import * as G from '../widget/game.js';
import { makeDeps, startMsg, query } from './fakes.js';

const answers = (tg) => tg.of('answerWidgetQuery').map((p) => JSON.parse(p.data));
const lastAnswer = (tg) => answers(tg).at(-1);
const bytes = (s) => Buffer.byteLength(s, 'utf8');

test('multiplier', () => {
  assert.equal(C.multiplier(false, 0), 1);
  assert.equal(C.multiplier(true, 0), 1.1);
  assert.equal(C.multiplier(true, 3), 1.4);
  assert.equal(C.multiplier(false, 15), 2.5);
  assert.equal(C.multiplier(true, 40), 2.6);
});

test('finalScore rounds raw × k', () => {
  assert.equal(C.finalScore(37, 1.2), 44);
  assert.equal(C.finalScore(10, 1.2), 12);
  assert.equal(C.finalScore(0, 2.6), 0);
});

test('parseScore accepts only e: plus 1-4 digits', () => {
  assert.equal(C.parseScore('e:12'), 12);
  assert.equal(C.parseScore('e:0'), 0);
  for (const bad of ['e:abc', 'e:-5', 'e:1e9', 'e:3.7', 'e:', 'e:12345', 'x:1', 'e: 5', 'e:5\n']) assert.equal(C.parseScore(bad), null, bad);
});

test('plausible', () => {
  assert.equal(C.plausible(10, 10 * 863), true);
  assert.equal(C.plausible(13, 10 * 863), false);
  assert.equal(C.plausible(1, 31 * 60 * 1000), false);
  assert.equal(C.plausible(0, -1), false);
});

test('bot and game agree on the minimum gate interval', () => {
  assert.equal(C.MIN_GATE_MS, G.MIN_GATE_MS);
});

test('topPayload survives long, Cyrillic, emoji and quoted names', () => {
  const name = 'Ж"\\😀'.repeat(10) + '\u0000\n';
  const rows = Array.from({ length: 10 }, (_, i) => ({ name, best: 9999 - i }));
  const s = C.topPayload(7, rows);
  assert.ok(bytes(s) <= 1024, 'bytes ' + bytes(s));
  const o = JSON.parse(s);
  assert.equal(o.r, 7);
  assert.equal(o.t.length, 10);
  assert.equal([...o.t[0][0]].length, 16);
  assert.equal(o.t[0][1], 9999);
  assert.equal(JSON.parse(C.topPayload(1, [{ name: '\u0000 ', best: 3 }])).t[0][0], 'Игрок');
});

test('/start creates the shared widget once, then reuses it', async () => {
  const { deps, tg, store } = makeDeps();
  await C.handleUpdate(startMsg(1), deps);
  const [first] = tg.of('sendWidget');
  assert.equal(first.chat_id, 1);
  assert.equal(first.html, deps.html);
  assert.equal(first.is_shared, true);
  assert.equal(first.allow_queries, true);
  assert.equal(first.width, 340);
  assert.equal(first.height, 440);
  assert.deepEqual(JSON.parse(first.public_data), { r: 0, t: [] });
  assert.match(first.caption, /топ-10/);
  assert.equal(store.config.get('widget:abc123'), 'W1');
  await C.handleUpdate(startMsg(2), deps);
  assert.equal(tg.of('sendWidget').length, 1);
  assert.deepEqual(tg.of('sendSharedWidget').map((p) => [p.chat_id, p.widget_id]), [[2, 'W1']]);
});

test('referrals: self, unknown, known, and returning players', async () => {
  const { deps, store } = makeDeps();
  await C.handleUpdate(startMsg(1, 'r1'), deps);
  assert.equal(store.players.get(1).referredBy, null);
  await C.handleUpdate(startMsg(2, 'r999'), deps);
  assert.equal(store.players.get(2).referredBy, null);
  await C.handleUpdate(startMsg(3, 'r1'), deps);
  assert.equal(store.players.get(3).referredBy, 1);
  await C.handleUpdate(startMsg(2, 'r1'), deps);
  assert.equal(store.players.get(2).referredBy, null, 'a returning player keeps no referrer');
  await C.handleUpdate(startMsg(3, 'r2'), deps);
  assert.equal(store.players.get(3).referredBy, 1, 'a referrer never changes');
  await C.handleUpdate(startMsg(4, 'rabc'), deps);
  assert.equal(store.players.get(4).referredBy, null);
});

test('a friend counts only after their first run starts', async () => {
  const { deps, tg } = makeDeps();
  await C.handleUpdate(startMsg(1), deps);
  await C.handleUpdate(startMsg(2, 'r1'), deps);
  await C.handleUpdate(query(1, 'i'), deps);
  assert.deepEqual(lastAnswer(tg), { k: 1, b: 0, p: 0, f: 0, s: 0 });
  await C.handleUpdate(query(2, 's'), deps);
  assert.deepEqual(lastAnswer(tg), {});
  await C.handleUpdate(query(1, 'i'), deps);
  assert.deepEqual(lastAnswer(tg), { k: 1.1, b: 0, p: 0, f: 1, s: 0 });
});

test('a full run records the multiplied score and publishes the top', async () => {
  const { deps, tg, clock } = makeDeps({ getChatMember: () => ({ status: 'member' }) });
  await C.handleUpdate(startMsg(1, null, 'Денис'), deps);
  await C.handleUpdate(startMsg(2, 'r1'), deps);
  await C.handleUpdate(query(2, 's'), deps);
  await C.handleUpdate(query(1, 's', 'Денис'), deps);
  clock.t += 20_000;
  await C.handleUpdate(query(1, 'e:10', 'Денис'), deps);
  assert.deepEqual(lastAnswer(tg), { v: 12, k: 1.2, b: 12, p: 1, t: [['Денис', 12]], r: 1 });
  const [edit] = tg.of('editSharedWidgetData');
  assert.equal(edit.widget_id, 'W1');
  assert.deepEqual(JSON.parse(edit.public_data), { r: 1, t: [['Денис', 12]] });
  assert.deepEqual(tg.of('getChatMember').at(-1), { chat_id: '@portal_vr_news', user_id: 1 });
  await C.handleUpdate(query(1, 'i', 'Денис'), deps);
  assert.deepEqual(lastAnswer(tg), { k: 1.2, b: 12, p: 1, f: 1, s: 1 });
});

test('a worse run keeps the best and does not republish the top', async () => {
  const { deps, tg, clock } = makeDeps();
  await C.handleUpdate(startMsg(1), deps);
  for (const n of [10, 4]) {
    await C.handleUpdate(query(1, 's'), deps);
    clock.t += 20_000;
    await C.handleUpdate(query(1, 'e:' + n), deps);
  }
  assert.deepEqual(lastAnswer(tg), { v: 4, k: 1, b: 10, p: 1, t: [['User1', 10]], r: 1 });
  assert.equal(tg.of('editSharedWidgetData').length, 1);
});

test('rejected results change nothing', async () => {
  const { deps, tg, store, clock } = makeDeps();
  await C.handleUpdate(startMsg(1), deps);
  await C.handleUpdate(query(1, 'e:5'), deps);
  assert.deepEqual(lastAnswer(tg), { err: 'run' });
  await C.handleUpdate(query(1, 's'), deps);
  clock.t += 1000;
  await C.handleUpdate(query(1, 'e:50'), deps);
  assert.deepEqual(lastAnswer(tg), { err: 'sus' });
  await C.handleUpdate(query(1, 's'), deps);
  clock.t += 60_000;
  for (const bad of ['e:abc', 'e:-5', 'e:1e9', 'e:3.7']) {
    await C.handleUpdate(query(1, bad), deps);
    assert.deepEqual(lastAnswer(tg), { err: 'bad' }, bad);
  }
  await C.handleUpdate(query(1, 'e:5'), deps);
  assert.equal(lastAnswer(tg).v, 5);
  await C.handleUpdate(query(1, 'e:6'), deps);
  assert.deepEqual(lastAnswer(tg), { err: 'run' }, 'one run, one result');
  assert.equal(store.players.get(1).best, 5);
});

test('a failed subscription check still records the score, without the bonus', async () => {
  const { deps, tg, clock } = makeDeps({ getChatMember: () => { throw new Error('Bad Request: member list is inaccessible'); } });
  await C.handleUpdate(startMsg(1), deps);
  await C.handleUpdate(query(1, 's'), deps);
  clock.t += 20_000;
  await C.handleUpdate(query(1, 'e:10'), deps);
  assert.equal(lastAnswer(tg).v, 10);
  assert.equal(lastAnswer(tg).k, 1);
});

test('restricted members count only while they are in the channel', async () => {
  let member = { status: 'restricted', is_member: true };
  const { deps, tg } = makeDeps({ getChatMember: () => member });
  await C.handleUpdate(startMsg(1), deps);
  await C.handleUpdate(query(1, 'i'), deps);
  assert.equal(lastAnswer(tg).s, 1);
  member = { status: 'restricted', is_member: false };
  await C.handleUpdate(query(1, 'i'), deps);
  assert.equal(lastAnswer(tg).s, 0);
  member = { status: 'kicked' };
  await C.handleUpdate(query(1, 'i'), deps);
  assert.equal(lastAnswer(tg).s, 0);
});

test('a failed top edit is retried on a later query', async () => {
  let fail = true;
  const { deps, tg, store, clock } = makeDeps({ editSharedWidgetData: () => { if (fail) throw new Error('Too Many Requests: retry after 1'); return true; } });
  await C.handleUpdate(startMsg(1), deps);
  await C.handleUpdate(query(1, 's'), deps);
  clock.t += 20_000;
  await C.handleUpdate(query(1, 'e:10'), deps);
  assert.equal(lastAnswer(tg).v, 10, 'the query is still answered');
  assert.equal(store.config.get('dirty'), '1');
  fail = false;
  clock.t += 5000;
  await C.handleUpdate(query(1, 'i'), deps);
  assert.equal(store.config.get('dirty'), '0');
  assert.equal(tg.of('editSharedWidgetData').length, 2);
});

test('top edits are spaced at least a second apart', async () => {
  const { deps, tg, store, clock } = makeDeps();
  await C.handleUpdate(startMsg(1), deps);
  await C.handleUpdate(startMsg(2), deps);
  await C.handleUpdate(query(1, 's'), deps);
  await C.handleUpdate(query(2, 's'), deps);
  clock.t += 20_000;
  await C.handleUpdate(query(1, 'e:10'), deps);
  clock.t += 300;
  await C.handleUpdate(query(2, 'e:11'), deps);
  assert.equal(tg.of('editSharedWidgetData').length, 1);
  assert.equal(store.config.get('dirty'), '1');
  assert.deepEqual(lastAnswer(tg).t, [['User2', 11], ['User1', 10]], 'the answer carries the fresh top anyway');
  clock.t += 1000;
  await C.handleUpdate(query(1, 'i'), deps);
  assert.deepEqual(JSON.parse(tg.of('editSharedWidgetData').at(-1).public_data).t, [['User2', 11], ['User1', 10]]);
});

test('"not modified" from Telegram counts as a successful edit', async () => {
  const { deps, store, clock } = makeDeps({ editSharedWidgetData: () => { throw new Error('Bad Request: message is not modified'); } });
  await C.handleUpdate(startMsg(1), deps);
  await C.handleUpdate(query(1, 's'), deps);
  clock.t += 20_000;
  await C.handleUpdate(query(1, 'e:10'), deps);
  assert.equal(store.config.get('dirty'), '0');
});

test('a storage failure is answered with err srv, exactly once', async () => {
  const { deps, tg, store } = makeDeps();
  await C.handleUpdate(startMsg(1), deps);
  store.failOn('startRun');
  await C.handleUpdate(query(1, 's'), deps);
  assert.deepEqual(answers(tg), [{ err: 'srv' }]);
});

test('a failing answerWidgetQuery does not throw out of the handler', async () => {
  const { deps } = makeDeps({ answerWidgetQuery: () => { throw new Error('query is too old'); } });
  await C.handleUpdate(query(1, 'i'), deps);
});

test('irrelevant updates write nothing', async () => {
  const { deps, tg, store } = makeDeps();
  const group = startMsg(1);
  group.message.chat = { id: -100, type: 'supergroup' };
  for (const u of [{}, null, { edited_message: {} }, group, { message: { chat: { id: 1, type: 'private' }, from: { id: 1 }, text: 'привет' } }, { message: { chat: { id: 1, type: 'private' }, from: { id: 1 } } }]) {
    await C.handleUpdate(u, deps);
  }
  await C.handleUpdate(query(1, 'zzz'), deps);
  assert.equal(store.writes, 0);
  assert.deepEqual(answers(tg), [{ err: 'bad' }]);
  assert.equal(tg.calls.length, 1);
});

test('answers stay within 1024 bytes with a full top of long names', async () => {
  const { deps, tg, clock } = makeDeps();
  const name = '😀"'.repeat(20);
  for (let id = 1; id <= 12; id++) {
    await C.handleUpdate(startMsg(id, null, name), deps);
    await C.handleUpdate(query(id, 's', name), deps);
  }
  clock.t += 600_000;
  for (let id = 1; id <= 12; id++) {
    clock.t += 2000;
    await C.handleUpdate(query(id, 'e:' + (100 + id), name), deps);
    const data = tg.of('answerWidgetQuery').at(-1).data;
    assert.ok(bytes(data) <= 1024, 'answer bytes ' + bytes(data));
  }
  assert.equal(lastAnswer(tg).p, 1);
  for (const p of tg.of('editSharedWidgetData')) assert.ok(bytes(p.public_data) <= 1024);
  await C.handleUpdate(query(1, 'i', name), deps);
  assert.equal(lastAnswer(tg).p, 12, 'a rank outside the top ten is reported');
});

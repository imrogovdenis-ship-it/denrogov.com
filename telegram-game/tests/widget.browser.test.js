import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const html = readFileSync(new URL('../dist/widget.html', import.meta.url), 'utf8');

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

// A stand-in for the object Telegram injects. `script` maps a request prefix to an answer or an error code.
function mock(script) {
  window.TelegramWidget = {
    viewer: { id: 77, first_name: 'Денис' },
    publicData: '{"r":1,"t":[["Аня",50],["Денис",44]]}',
    calls: [], links: [], handlers: {}, watched: false,
    request(data) {
      this.calls.push(data);
      const rule = script[data[0]];
      const r = Array.isArray(rule) ? (rule.length > 1 ? rule.shift() : rule[0]) : rule;
      return typeof r === 'string' ? Promise.reject({ name: 'WidgetRequestError', code: r }) : Promise.resolve({ result: JSON.stringify(r ?? {}) });
    },
    onEvent(name, fn) { (this.handlers[name] ??= []).push(fn); },
    emit(name) { (this.handlers[name] || []).forEach((fn) => fn()); },
    watchPublicData() { this.watched = true; },
    openTelegramLink(url) { this.links.push(url); },
  };
}

async function open(script) {
  const page = await browser.newPage({ viewport: { width: 340, height: 440 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setContent((script ? `<script>(${mock})(${JSON.stringify(script)})</script>` : '') + html);
  return { page, errors };
}
const calls = (page) => page.evaluate(() => window.TelegramWidget.calls);
const overText = (page) => page.locator('#o').innerText();
const waitOver = (page) => page.waitForFunction(() => !document.getElementById('o').hidden, null, { timeout: 8000 });
const tap = (page) => page.dispatchEvent('#c', 'pointerdown');
const answers = { i: { k: 1.2, b: 44, p: 35, f: 2, s: 0 }, s: {}, e: { v: 0, k: 1.2, b: 44, p: 35, t: [['Аня', 50], ['Денис', 44]], r: 2 } };

test('asks the bot for the player state on load and watches the shared top', async () => {
  const { page, errors } = await open(answers);
  assert.deepEqual(await calls(page), ['i']);
  assert.equal(await page.evaluate(() => window.TelegramWidget.watched), true);
  assert.deepEqual(errors, []);
  await page.close();
});

test('a tap starts a run, the bird flies, and the result is sent automatically', async () => {
  const { page, errors } = await open(answers);
  await tap(page);
  assert.deepEqual(await calls(page), ['i', 's']);
  const shot = () => page.evaluate(() => document.getElementById('c').toDataURL());
  const a = await shot();
  await page.waitForTimeout(150);
  assert.notEqual(await shot(), a);
  await waitOver(page);
  assert.deepEqual(await calls(page), ['i', 's', 'e:0']);
  const text = await overText(page);
  assert.match(text, /0 × 1\.2 = 0/);
  assert.match(text, /Рекорд 44/);
  assert.match(text, /Твоё место: 35/);
  assert.match(text, /Аня/);
  assert.equal(await page.locator('#o tr.me').innerText().then((t) => t.replace(/\s+/g, ' ').trim()), '2 Денис 44');
  assert.equal(await page.locator('#o button', { hasText: 'Узнать место' }).count(), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test('«Ещё раз» starts a new run', async () => {
  const { page } = await open(answers);
  await tap(page);
  await waitOver(page);
  await page.locator('#o button', { hasText: 'Ещё раз' }).click();
  assert.equal(await page.locator('#o').isHidden(), true);
  assert.deepEqual(await calls(page), ['i', 's', 'e:0', 's']);
  await page.close();
});

test('a rate-limited result can be sent with «Узнать место»', async () => {
  const { page } = await open({ ...answers, e: ['RATE_LIMITED', answers.e] });
  await tap(page);
  await waitOver(page);
  const button = page.locator('#o button', { hasText: 'Узнать место' });
  await button.waitFor();
  await button.click();
  await page.waitForFunction(() => /Твоё место: 35/.test(document.getElementById('o').innerText));
  assert.deepEqual(await calls(page), ['i', 's', 'e:0', 'e:0']);
  assert.equal(await button.count(), 0);
  await page.close();
});

test('a refused result is explained', async () => {
  for (const [rule, text] of [[{ err: 'sus' }, /не принят/], ['TIMEOUT', /не ответил/], ['FAILED', /связи/]]) {
    const { page } = await open({ ...answers, e: rule });
    await tap(page);
    await waitOver(page);
    await page.waitForFunction((src) => new RegExp(src).test(document.getElementById('o').innerText), text.source);
    await page.close();
  }
});

test('the table follows the shared state and ignores older revisions', async () => {
  const { page } = await open(answers);
  await tap(page);
  await waitOver(page);
  const push = (data) => page.evaluate((d) => { window.TelegramWidget.publicData = d; window.TelegramWidget.emit('publicDataChanged'); }, data);
  await push('{"r":5,"t":[["Борис",99]]}');
  assert.match(await overText(page), /Борис/);
  await push('{"r":3,"t":[["Старый",1]]}');
  assert.doesNotMatch(await overText(page), /Старый/);
  await push('not json');
  assert.match(await overText(page), /Борис/);
  await page.close();
});

test('names cannot inject markup', async () => {
  const { page } = await open({ ...answers, e: { ...answers.e, t: [['<img id=evil>&amp;', 5]] } });
  await tap(page);
  await waitOver(page);
  assert.equal(await page.locator('#evil').count(), 0);
  await page.close();
});

test('the invite and subscribe buttons open the right Telegram links', async () => {
  const { page } = await open(answers);
  await tap(page);
  await waitOver(page);
  await page.locator('#o button', { hasText: 'Позвать друга' }).click();
  await page.locator('#o button', { hasText: 'Подписаться' }).click();
  const links = await page.evaluate(() => window.TelegramWidget.links);
  assert.equal(links[0], 'https://t.me/share/url?url=' + encodeURIComponent('https://t.me/portalvr?start=r77'));
  assert.ok(links[0].length <= 256);
  assert.equal(links[1], 'https://t.me/portal_vr_news');
  await page.close();
});

test('a subscriber is not asked to subscribe again', async () => {
  const { page } = await open({ ...answers, i: { ...answers.i, s: 1 } });
  await tap(page);
  await waitOver(page);
  assert.equal(await page.locator('#o button', { hasText: 'Подписаться' }).count(), 0);
  assert.match(await overText(page), /2\/15/);
  await page.close();
});

test('outside Telegram the game plays without a leaderboard', async () => {
  const { page, errors } = await open(null);
  await tap(page);
  await waitOver(page);
  assert.equal(await page.locator('#o button').count(), 1);
  assert.deepEqual(errors, []);
  await page.close();
});

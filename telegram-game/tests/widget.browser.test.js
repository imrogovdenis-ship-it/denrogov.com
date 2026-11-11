import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const html = readFileSync(new URL('../dist/widget.html', import.meta.url), 'utf8');

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

// A stand-in for the object Telegram injects, enforcing the request rules of the widget guide:
// one request in flight (BUSY), a request needs a real tap (click / pointerup, never pointerdown) and a tap
// unlocks one call, and tapless "background" requests are spaced by `opts.bgGap` ms. `script` maps a request
// prefix to an answer or an error code; answers arrive after `opts.delay` ms.
function mock(script, opts) {
  let tap = false, pending = false, lastBg = -Infinity;
  for (const type of ['click', 'pointerup']) {
    document.addEventListener(type, () => { tap = true; }, true);
    window.addEventListener(type, () => { tap = false; });
  }
  const fail = (code) => Promise.reject({ name: 'WidgetRequestError', code });
  const spend = () => { const ok = tap; tap = false; return ok; };
  window.TelegramWidget = {
    viewer: opts.viewer, publicData: '{"r":1,"t":[["Аня",50],["Денис",44]]}',
    calls: [], refused: [], links: [], handlers: {}, watched: false,
    request(data) {
      if (pending) { this.refused.push(data + ':BUSY'); return fail('BUSY'); }
      if (!spend()) {
        if (performance.now() - lastBg < opts.bgGap) { this.refused.push(data + ':RATE_LIMITED'); return fail('RATE_LIMITED'); }
        lastBg = performance.now();
      }
      this.calls.push(data);
      const rule = script[data[0]];
      const r = Array.isArray(rule) ? (rule.length > 1 ? rule.shift() : rule[0]) : rule;
      pending = true;
      return new Promise((resolve, reject) => setTimeout(() => {
        pending = false;
        typeof r === 'string' ? reject({ name: 'WidgetRequestError', code: r }) : resolve({ result: JSON.stringify(r ?? {}) });
      }, opts.delay));
    },
    onEvent(name, fn) { (this.handlers[name] ??= []).push(fn); },
    emit(name) { (this.handlers[name] || []).forEach((fn) => fn()); },
    watchPublicData() { this.watched = true; },
    openTelegramLink(url) { if (spend()) this.links.push(url); },
  };
}

async function open(script, opts = {}) {
  const page = await browser.newPage({ viewport: { width: 340, height: 440 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const o = { delay: 20, bgGap: 0, viewer: { id: 77, first_name: 'Денис' }, ...opts };
  await page.setContent((script ? `<script>(${mock})(${JSON.stringify(script)},${JSON.stringify(o)})</script>` : '') + html);
  if (script) await page.waitForTimeout(60); // let the initial `i` settle, as it would before a human taps
  return { page, errors };
}
const calls = (page) => page.evaluate(() => window.TelegramWidget.calls);
const refused = (page) => page.evaluate(() => window.TelegramWidget.refused);
const overText = (page) => page.locator('#o').innerText();
const overShown = () => getComputedStyle(document.getElementById('o')).display !== 'none';
const waitOver = (page) => page.waitForFunction(overShown, null, { timeout: 8000 });
const tap = (page) => page.click('#c');
const waitResult = (page) => page.waitForFunction(() => / = 0/.test(document.getElementById('o').innerText), null, { timeout: 8000 });
const again = (page) => page.locator('#o button', { hasText: 'Ещё раз' });
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
  await waitResult(page);
  assert.deepEqual(await calls(page), ['i', 's', 'e:0']);
  const text = await overText(page);
  assert.match(text, /0 × 1\.2 = 0/);
  assert.match(text, /Рекорд 44/);
  assert.match(text, /Твоё место: 35/);
  assert.match(text, /Аня/);
  assert.equal(await page.locator('#o tr.me').innerText().then((t) => t.replace(/\s+/g, ' ').trim()), '2 Денис 44');
  assert.equal(await page.locator('#o button', { hasText: 'Узнать место' }).count(), 0);
  assert.deepEqual(await refused(page), [], 'no request broke a Telegram rule');
  assert.deepEqual(errors, []);
  await page.close();
});

test('«Ещё раз» starts a new run', async () => {
  const { page } = await open(answers);
  await tap(page);
  await waitOver(page);
  await again(page).click();
  assert.equal(await page.evaluate(overShown), false);
  assert.deepEqual(await calls(page), ['i', 's', 'e:0', 's']);
  await page.close();
});

test('a finger going down does not start a run — it may become a scroll', async () => {
  const { page } = await open(answers);
  await page.dispatchEvent('#c', 'pointerdown');
  await page.dispatchEvent('#c', 'pointercancel');
  await page.waitForTimeout(1500);
  assert.deepEqual(await calls(page), ['i']);
  assert.equal(await page.evaluate(overShown), false);
  await page.close();
});

test('a restart waits for the pending result instead of losing the next run', async () => {
  const { page } = await open(answers, { delay: 400 });
  await page.waitForTimeout(450);
  await tap(page);
  await waitOver(page);
  assert.equal(await again(page).isDisabled(), true, 'disabled while the result is in flight');
  await waitResult(page);
  assert.equal(await again(page).isDisabled(), false);
  await again(page).click();
  await waitOver(page);
  await page.waitForFunction(() => window.TelegramWidget.calls.length === 5);
  assert.deepEqual(await calls(page), ['i', 's', 'e:0', 's', 'e:0']);
  assert.deepEqual(await refused(page), []);
  await page.close();
});

test('a tap while the first request is still in flight does not start an unrecorded run', async () => {
  const { page } = await open(answers, { delay: 600 });
  await tap(page);
  await page.waitForTimeout(100);
  assert.deepEqual(await calls(page), ['i']);
  await page.waitForTimeout(700);
  await tap(page);
  assert.deepEqual(await calls(page), ['i', 's']);
  assert.deepEqual(await refused(page), []);
  await page.close();
});

test('a slow start answer still gets the result sent afterwards', async () => {
  const { page } = await open(answers, { delay: 1500 });
  await page.waitForTimeout(1500);
  await tap(page);
  await waitOver(page);
  await waitResult(page);
  assert.deepEqual(await calls(page), ['i', 's', 'e:0']);
  assert.deepEqual(await refused(page), []);
  await page.close();
});

test('a run whose start never reached the bot is not sent and says so', async () => {
  const { page } = await open({ ...answers, s: 'FAILED' });
  await tap(page);
  await waitOver(page);
  await page.waitForFunction(() => /не засчитан/.test(document.getElementById('o').innerText));
  assert.deepEqual(await calls(page), ['i', 's']);
  await again(page).click();
  assert.deepEqual(await calls(page), ['i', 's', 's']);
  await page.close();
});

test('a background limit on the automatic result leads to «Узнать место»', async () => {
  const { page } = await open(answers, { bgGap: 60_000 });
  await tap(page);
  await waitOver(page);
  const button = page.locator('#o button', { hasText: 'Узнать место' });
  await button.waitFor();
  assert.deepEqual(await calls(page), ['i', 's']);
  await button.click();
  await waitResult(page);
  assert.deepEqual(await calls(page), ['i', 's', 'e:0']);
  await page.close();
});

test('a viewer without a first name still gets the result screen', async () => {
  const { page, errors } = await open(answers, { viewer: { id: 77 } });
  await tap(page);
  await waitOver(page);
  assert.match(await overText(page), /Аня/);
  assert.deepEqual(errors, []);
  await page.close();
});

test('a rate-limited result can be sent with «Узнать место»', async () => {
  const { page } = await open({ ...answers, e: ['RATE_LIMITED', answers.e] });
  await tap(page);
  await waitOver(page);
  const button = page.locator('#o button', { hasText: 'Узнать место' });
  await button.waitFor();
  await button.click();
  await waitResult(page);
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
  assert.equal(await page.locator('#o button', { hasText: 'Подписан ✓' }).isDisabled(), true);
  assert.match(await overText(page), /2\/15/);
  assert.match(await overText(page), /каждый друг, который пришёл по твоей ссылке и сыграл \(до 15\)/);
  const fits = await page.evaluate(() => [...document.querySelectorAll('#o > *')].every((el) => el.getBoundingClientRect().bottom <= 440 - 18));
  assert.equal(fits, true, 'everything fits above the message time badge');
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = new URL('..', import.meta.url).pathname;
const html = readFileSync(root + 'dist/widget.html', 'utf8');

test('the built widget fits Telegram limits', () => {
  assert.ok(Buffer.byteLength(html) <= 32768);
  const packed = deflateSync(Buffer.from(html), { level: 9 }).length;
  assert.ok(packed <= 4096, `compressed size ${packed}`);
  assert.ok(!html.includes('\0'));
});

test('the widget avoids features the sandbox profile does not promise', () => {
  for (const risky of ['.hidden=', 'localStorage.p', '+"44"']) assert.ok(!html.includes(risky), risky);
  assert.ok(!/<(p|td|tr)>(?:(?!<\/\1>).)*<\1>/.test(html.replace(/\$\{[^}]*\}/g, '')), 'implied end tags');
});

test('the built widget is self-contained', () => {
  for (const banned of ['fetch(', ' src=', 'http://', '/*GAME*/', 'export ']) assert.ok(!html.includes(banned), banned);
});

test('the generated module carries the same HTML and its hash', async () => {
  const gen = await import('../supabase/functions/portal-game/widget.generated.ts');
  assert.equal(gen.HTML, html);
  assert.equal(gen.HTML_HASH, createHash('sha256').update(html).digest('hex').slice(0, 12));
});

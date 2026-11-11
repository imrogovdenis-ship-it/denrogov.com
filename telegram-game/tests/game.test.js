import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../widget/game.js';

const rand = () => 0.5;
const DT = 1 / 60;

test('newGame starts alive with score 0 and one gate ahead', () => {
  const s = G.newGame(rand);
  assert.equal(s.dead, false);
  assert.equal(s.score, 0);
  assert.equal(s.speed, G.SPEED0);
  assert.equal(s.gates.length, 1);
  assert.equal(s.gates[0].x, G.W + 80);
});

test('without flapping the bird hits the floor', () => {
  const s = G.newGame(rand);
  for (let i = 0; i < 180; i++) G.step(s, DT, rand);
  assert.equal(s.dead, true);
});

test('flap gives upward velocity, and does nothing when dead', () => {
  const s = G.newGame(rand);
  G.flap(s);
  assert.equal(s.v, G.FLAP_V);
  s.dead = true;
  s.v = 5;
  G.flap(s);
  assert.equal(s.v, 5);
});

function holdAt(s, offset, untilScore) {
  for (let i = 0; i < 100000 && !s.dead && s.score < untilScore; i++) {
    const g = s.gates.find((g) => !g.passed);
    s.y = g.gapY + offset;
    s.v = 0;
    G.step(s, DT, rand);
  }
}

test('a bird at the gap centre passes the first gate', () => {
  const s = G.newGame(rand);
  holdAt(s, 0, 1);
  assert.equal(s.dead, false);
  assert.equal(s.score, 1);
  assert.equal(s.speed, G.SPEED0 + G.SPEED_STEP);
});

test('a bird a full gap below the centre dies at the gate', () => {
  const s = G.newGame(rand);
  holdAt(s, G.GAP, 1);
  assert.equal(s.dead, true);
  assert.equal(s.score, 0);
});

test('speed never exceeds SPEED_MAX', () => {
  const s = G.newGame(rand);
  holdAt(s, 0, 100);
  assert.equal(s.score, 100);
  assert.equal(s.speed, G.SPEED_MAX);
  assert.ok(s.gates.length < 6, 'off-screen gates are removed');
});

test('MIN_GATE_MS is 863', () => {
  assert.equal(G.MIN_GATE_MS, 863);
});

test('a huge dt is clamped to 0.05', () => {
  const a = G.newGame(rand);
  const b = G.newGame(rand);
  G.step(a, 5, rand);
  G.step(b, 0.05, rand);
  assert.deepEqual(a, b);
});

// Pure game logic: no DOM. Inlined into the widget by build/build.mjs.
export const W = 340, H = 440, BIRD_X = 90, BIRD_R = 12, GATE_W = 46, GAP = 140,
  SPACING = 190, SPEED0 = 120, SPEED_MAX = 220, SPEED_STEP = 3, GRAVITY = 1100, FLAP_V = -340;

// The fastest a gate can follow another one. The bot uses the same number to reject impossible scores.
export const MIN_GATE_MS = Math.floor(SPACING / SPEED_MAX * 1000);

const gate = (x, rand) => ({ x, gapY: 110 + rand() * (H - 220), passed: false });

export const newGame = (rand) => ({ y: H / 2, v: 0, speed: SPEED0, score: 0, dead: false, gates: [gate(W + 80, rand)] });

export const flap = (s) => { if (!s.dead) s.v = FLAP_V; };

export function step(s, dt, rand) {
  if (s.dead) return;
  dt = Math.min(dt, 0.05);
  s.v += GRAVITY * dt;
  s.y += s.v * dt;
  if (s.y < BIRD_R || s.y > H - BIRD_R) s.dead = true;
  for (const g of s.gates) {
    g.x -= s.speed * dt;
    // Circle against the cubes above and below the gap.
    if (g.x < BIRD_X + BIRD_R && g.x + GATE_W > BIRD_X - BIRD_R && Math.abs(s.y - g.gapY) > GAP / 2 - BIRD_R) s.dead = true;
    if (!g.passed && g.x + GATE_W < BIRD_X && !s.dead) {
      g.passed = true;
      s.score++;
      s.speed = Math.min(SPEED_MAX, s.speed + SPEED_STEP);
    }
  }
  if (s.gates[0].x < -GATE_W) s.gates.shift();
  const last = s.gates[s.gates.length - 1];
  if (last.x < W - SPACING) s.gates.push(gate(last.x + SPACING, rand));
}

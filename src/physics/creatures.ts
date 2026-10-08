/**
 * creatures.ts — Wobbly blob creatures.
 *
 * Spec:
 *  - Up to 22 creatures on screen
 *  - Wobbly outline (sinusoidal polar radius) + two eyes facing heading
 *  - Move toward resting pen (sp < 1.5, d < 340, d > 70)
 *  - Flee pen moving faster than 9 (d < 220)
 *  - Wrap at screen edges
 *  - Spawned on click (60% chance) or at init (6 starting creatures)
 */

export interface Creature {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Heading angle in radians */
  a: number;
  /** Phase offset for wobble */
  ph: number;
  /** Radius */
  r: number;
}

export const cells: Creature[] = [];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Spawn one creature at (x, y). Respects the 22-creature cap.
 */
export function born(x: number, y: number, W: number, H: number): void {
  void H; // used by caller but not needed here (kept for API symmetry)
  void W;
  if (cells.length < 22) {
    cells.push({
      x,
      y,
      vx: 0,
      vy: 0,
      a: rnd(0, Math.PI * 2),
      ph: rnd(0, Math.PI * 2),
      r: rnd(13, 21),
    });
  }
}

/**
 * Spawn the initial 6 creatures scattered across the screen.
 */
export function initCreatures(W: number, H: number): void {
  for (let i = 0; i < 6; i++) {
    born(rnd(0, W), rnd(0, H), W, H);
  }
}

/**
 * Advance all creatures by one fixed timestep.
 */
export function stepCreatures(
  penX: number,
  penY: number,
  penSpeed: number,
  penSeen: boolean,
  W: number,
  H: number
): void {
  for (const k of cells) {
    k.ph += 0.06;
    // Random walk + tendency
    k.a += rnd(-0.12, 0.12);
    let sx = Math.cos(k.a) * 0.9;
    let sy = Math.sin(k.a) * 0.9;

    if (penSeen) {
      const dx = penX - k.x;
      const dy = penY - k.y;
      const d = Math.hypot(dx, dy) || 1;

      if (penSpeed > 9 && d < 220) {
        // Flee
        sx -= (dx / d) * 4;
        sy -= (dy / d) * 4;
      } else if (penSpeed < 1.5 && d < 340 && d > 70) {
        // Approach
        sx += (dx / d) * 1.4;
        sy += (dy / d) * 1.4;
      }
    }

    k.vx += (sx - k.vx) * 0.06;
    k.vy += (sy - k.vy) * 0.06;
    k.x += k.vx;
    k.y += k.vy;

    // Wrap at edges
    if (k.x < -40) k.x = W + 40;
    if (k.x > W + 40) k.x = -40;
    if (k.y < -40) k.y = H + 40;
    if (k.y > H + 40) k.y = -40;
  }
}

/**
 * Draw all creatures onto the canvas.
 */
export function drawCreatures(
  c: CanvasRenderingContext2D,
  INK: string
): void {
  c.globalAlpha = 0.85;
  c.lineWidth = 1.6;
  c.strokeStyle = INK;
  c.fillStyle = INK;

  for (const k of cells) {
    // Wobbly outline
    c.beginPath();
    for (let i = 0; i <= 12; i++) {
      const q = (i / 12) * Math.PI * 2;
      const r =
        k.r *
        (1 + 0.14 * Math.sin(q * 3 + k.ph) + 0.08 * Math.sin(q * 2 - k.ph * 1.3));
      const px = k.x + Math.cos(q) * r;
      const py = k.y + Math.sin(q) * r * 0.92;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
    c.stroke();

    // Eyes facing heading
    const h = Math.atan2(k.vy, k.vx);
    for (const side of [-1, 1] as const) {
      const ex =
        k.x +
        Math.cos(h) * k.r * 0.35 +
        Math.cos(h + Math.PI / 2) * side * k.r * 0.3;
      const ey =
        k.y +
        Math.sin(h) * k.r * 0.35 +
        Math.sin(h + Math.PI / 2) * side * k.r * 0.3;
      c.beginPath();
      c.arc(ex, ey, 2.2, 0, Math.PI * 2);
      c.fill();
    }
  }

  c.globalAlpha = 1;
}

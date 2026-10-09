/**
 * physics.ts — Core physics primitives.
 * Hand-written, zero dependencies. Fixed-timestep 60 Hz accumulator.
 *
 * All values from the template spec:
 *   spring 0.05, velocity damping 0.86
 *   rotation spring 0.05, rotation damping 0.9
 *   pen repel radius 85, force (1-d/R)^2 * (speed*0.12 + 1.4)
 *   gravity 0.7, floor bounce 0.45, friction 0.8, rotation damping 0.6
 */

// ── Types ──────────────────────────────────────────────────────────

/** Mutable state of one letter body. */
export interface LetterBody {
  /** Current displacement from rest position (px) */
  x: number;
  y: number;
  /** Velocity (px/frame) */
  vx: number;
  vy: number;
  /** Rotation from rest (radians) */
  r: number;
  /** Angular velocity (rad/frame) */
  vr: number;
  /** Rest position in document coordinates (set by measure pass) */
  cx: number;
  cy: number;
  /** Maximum downward displacement before hitting the section floor */
  fl: number;
  /** DOM span element */
  e: HTMLSpanElement;
  /** Owning section element (for floor calculation) */
  sec: Element;
  /** Whether body is currently displaced (0 = at rest) */
  on: number;
  /** Whether "near" outline is showing */
  nr: number;
  /** Previous frame values to avoid redundant DOM writes */
  prevX?: number;
  prevY?: number;
  prevR?: number;
}

/** Pen state: a mass on a spring that follows the pointer. */
export interface PenState {
  x: number;
  y: number;
  /** Previous position for continuous ink trail */
  ox: number;
  oy: number;
  /** Target (actual pointer position) */
  tx: number;
  ty: number;
  /** Velocity */
  vx: number;
  vy: number;
  /** Speed magnitude (px/frame) */
  sp: number;
  /** Current line width */
  w: number;
  /** Idle counter (frames with sp < 0.3) */
  idle: number;
  /** Growing bead radius when idle */
  bead: number;
  /** Whether pen has ever been seen (first move) */
  seen: boolean;
  /** Whether pointer is coarse touch (no spring lag) */
  isTouch?: boolean;
  /** Whether pointer/finger is currently pressed down */
  isDown?: boolean;
  /** Timestamp when touch ended for 150ms fade out */
  touchFadeStartTime?: number;
  /** Whether touch movement unlocked horizontal drawing */
  touchStrokeActive?: boolean;
  /** Starting touch coordinates to detect horizontal angle */
  touchStartX?: number;
  touchStartY?: number;
  /** Index in segs array when current touch stroke started */
  touchStrokeSegStartIndex?: number;
}

// ── Constants (spec-exact) ─────────────────────────────────────────

export const SPRING = 0.05;
export const DAMP = 0.86;
export const ROT_SPRING = 0.05;
export const ROT_DAMP = 0.9;
export const REPEL_R = 85;
export const GRAVITY = 0.7;
export const BOUNCE = 0.45;
export const FRICTION = 0.8;
export const ROT_DAMP_G = 0.6;
export const NEAR_THRESHOLD = 6; // px — when to show dashed outline

/** pen spring / damping */
export const PEN_SPRING = 0.2;
export const PEN_DAMP = 0.62;

/** Fixed timestep: 60 Hz = 1000/60 ms per tick */
export const FIXED_DT = 1000 / 60;

// ── Spring / letter physics ────────────────────────────────────────

/**
 * Apply one spring step to a letter body.
 * Returns the new displacement vector.
 */
export function springStep(body: LetterBody): void {
  body.vx -= body.x * SPRING;
  body.vy -= body.y * SPRING;
  body.vx *= DAMP;
  body.vy *= DAMP;
  body.x += body.vx;
  body.y += body.vy;
}

/**
 * Apply one rotation spring step.
 */
export function rotStep(body: LetterBody): void {
  body.vr -= body.r * ROT_SPRING;
  body.vr *= ROT_DAMP;
  body.r += body.vr;
}

/**
 * Apply gravity + floor collision to a letter body (gravity mode).
 * Supports directional gravity vector (gx, gy) from device tilt.
 */
export function gravityStep(body: LetterBody, gx = 0, gy = GRAVITY): void {
  body.vy += gy;
  body.vx += gx;
  body.vx *= FRICTION;
  body.vr *= ROT_DAMP_G;
  body.x += body.vx;
  body.y += body.vy;
  body.r += body.vr;

  if (body.y > body.fl) {
    body.y = body.fl;
    body.vy *= -BOUNCE;
    body.vx *= FRICTION;
    body.vr *= ROT_DAMP_G;
    if (Math.abs(body.vy) < 1) body.vy = 0;
  }
}

/**
 * Apply radial shockwave impulse from a tap or click.
 */
export function shockwaveStep(
  body: LetterBody,
  sx: number,
  sy: number,
  strength = 6,
  falloff = 220
): boolean {
  const bx = body.cx + body.x;
  const by = body.cy + body.y;
  const dx = bx - sx;
  const dy = by - sy;
  const d = Math.hypot(dx, dy) || 1;
  if (d < falloff) {
    const f = (1 - d / falloff) * strength;
    body.vx += (dx / d) * f;
    body.vy += (dy / d) * f;
    body.vr += (dx / d) * f * 0.01;
    return true;
  }
  return false;
}

/**
 * Apply pen repulsion force to a letter body.
 * @param px pen x in document coordinates
 * @param py pen y in document coordinates
 * @param sp pen speed
 */
export function repelStep(
  body: LetterBody,
  px: number,
  py: number,
  sp: number
): boolean {
  const bx = body.cx + body.x;
  const by = body.cy + body.y;
  const dx = bx - px;
  const dy = by - py;
  const d = Math.hypot(dx, dy) || 1;
  if (d < REPEL_R) {
    const f = (1 - d / REPEL_R) ** 2 * (sp * 0.12 + 1.4);
    body.vx += (dx / d) * f;
    body.vy += (dy / d) * f;
    body.vr += (dx / d) * f * 0.006;
    return true;
  }
  return false;
}

/**
 * Returns true if the body is effectively at rest and can be skipped.
 * Threshold: total energy < 0.05
 */
export function isAtRest(body: LetterBody): boolean {
  return (
    Math.abs(body.x) +
      Math.abs(body.y) +
      Math.abs(body.vx) +
      Math.abs(body.vy) +
      Math.abs(body.r) * 40 <
    0.05
  );
}

// ── Pen physics ────────────────────────────────────────────────────

/**
 * Advance pen by one fixed timestep.
 * On touch (coarse pointer), follows target directly with no spring lag.
 */
export function penStep(pen: PenState): void {
  pen.ox = pen.x;
  pen.oy = pen.y;

  if (pen.isTouch) {
    // Touch: follows finger directly with zero spring lag
    pen.x = pen.tx;
    pen.y = pen.ty;
    pen.vx = pen.x - pen.ox;
    pen.vy = pen.y - pen.oy;
    pen.sp = Math.hypot(pen.vx, pen.vy);
  } else {
    // Mouse / fine pointer: spring filter
    pen.vx = (pen.vx + (pen.tx - pen.x) * PEN_SPRING) * PEN_DAMP;
    pen.vy = (pen.vy + (pen.ty - pen.y) * PEN_SPRING) * PEN_DAMP;
    pen.x += pen.vx;
    pen.y += pen.vy;
    pen.sp = Math.hypot(pen.vx, pen.vy);
  }
}

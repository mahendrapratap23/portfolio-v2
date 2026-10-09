# Codebase Audit: Dot-Grid Paper Background & Living Physics Sheet

Date: October 2026  
Status: Phase 0 Complete — Awaiting User Approval (No Code Changes Made)

---

## 1. Current State of CSS Dot Grid & Crease Texture

### 1.1 Existing CSS in `src/style.css`
- **Background Color**: `body` currently specifies `background: var(--paper);` (`#fbfaf6` in light mode, `#131313` in dark mode).
- **Current Tokens**:
  - Palette tokens exist: `--paper`, `--ink`, `--blue`.
  - Spacing tokens exist: `--section-pad-v: 9vh`, `--section-pad-h: 7vw`.
- **Finding**:
  - The repository does **not** yet declare `--dot` or `--grid` CSS variables in `:root`.
  - There is currently no active `radial-gradient` dot grid or crease texture layer defined on `body` or `html`.
  - The only paper-like decorative element currently present is the blueprint outline on the hero section (`.hero::before` with `border: 1px solid var(--ink); opacity: 0.22; pointer-events: none; inset: 3vh 3vw;`).

### 1.2 Required CSS Baseline & Fallback Architecture (for Phase 1)
To ensure the living sheet operates seamlessly with progressive enhancement and rock-solid fallbacks:
1. **CSS Token Definitions**:
   - Spacing token `--grid`: default `28px` on desktop, `34px` on coarse pointers (`@media (pointer: coarse)`).
   - Dot color token `--dot`:
     - Light mode: subtle ink dot `color-mix(in srgb, var(--ink) 18%, transparent)` or `rgba(22, 22, 22, 0.18)` (maintaining >= 4.5:1 body text contrast).
     - Dark mode: `color-mix(in srgb, var(--ink) 18%, transparent)` or `rgba(239, 236, 228, 0.18)`.
2. **CSS Crease Texture Layer**:
   - A dedicated fixed layer (e.g. on `body::before` or a `<div id="crease-layer" aria-hidden="true">`) with `position: fixed; inset: 0; pointer-events: none; z-index: 0;` representing subtle paper fiber / fold creases.
   - Remains completely unchanged above or below the sheet canvas.
3. **CSS Dot Grid Fallback (`body::after` or `#bg-fallback`)**:
   - Visual dots via CSS `radial-gradient(circle, var(--dot) 1px, transparent 1px) 0 0 / var(--grid) var(--grid)`.
   - Serves as the zero-JS, `prefers-reduced-motion: reduce`, and canvas-failure fallback.
   - When the physics sheet canvas is running, a class (e.g. `body.sheet-canvas-active`) hides the static CSS dot pattern so dots are not drawn twice, while keeping the paper background color and crease texture active.

---

## 2. Shared Pointer & Pen State

### 2.1 Location
- **State Definition**: [`src/physics/physics.ts:46-70`](file:///Users/sagar/Developer/portfolio%20v2/src/physics/physics.ts#L46-L70) (`PenState` interface) and [`penStep()`](file:///Users/sagar/Developer/portfolio%20v2/src/physics/physics.ts#L211-L230).
- **Runtime Singleton & Event Listeners**: [`src/physics/bootstrap.ts:58-150`](file:///Users/sagar/Developer/portfolio%20v2/src/physics/bootstrap.ts#L58-L150).

### 2.2 Pen State Object
```ts
const isCoarse = matchMedia('(pointer: coarse)').matches;

const pen: PenState = {
  x: W / 2,         // Current spring-interpolated x (or finger x on touch)
  y: H / 2,         // Current spring-interpolated y (or finger y on touch)
  ox: W / 2,        // Previous frame x
  oy: H / 2,        // Previous frame y
  tx: W / 2,        // Target pointer clientX
  ty: H / 2,        // Target pointer clientY
  vx: 0, vy: 0,     // Velocity vector
  sp: 0,            // Speed magnitude: hypot(vx, vy)
  w: 5,             // Ink line width
  idle: 0,          // Consecutive frames stationary
  bead: 0,          // Growing ink bead radius
  seen: false,      // Whether pointer has interacted
  isTouch: isCoarse // True on mobile touch / coarse pointers
};
```

### 2.3 Existing Listener Paths
- **`pointerdown`** ([`src/physics/bootstrap.ts:81-106`](file:///Users/sagar/Developer/portfolio%20v2/src/physics/bootstrap.ts#L81-L106)):
  - Passive listener `{ passive: true }`.
  - Sets `pen.seen = true`, updates `pen.tx, pen.ty`, synchronizes `pen.x, pen.y` on touch.
  - Spawns ink blot via `spawnBlot()`.
  - Dispatches shockwaves to letters (`shockwaveLetters()`) and portrait (`shockwavePortrait()`).
  - Dispatches global custom event: `dispatchEvent(new CustomEvent('shockwave', { detail: { x, y } }))`.
- **`pointermove`** ([`src/physics/bootstrap.ts:108-130`](file:///Users/sagar/Developer/portfolio%20v2/src/physics/bootstrap.ts#L108-L130)):
  - Passive listener `{ passive: true }`.
  - On coarse/touch pointers: updates `pen.x, pen.y` directly with zero spring lag, computing `pen.vx, pen.vy, pen.sp`.
  - On fine mouse pointers: updates `pen.tx, pen.ty`, while `penStep()` integrates spring damping.
- **`pointerup` / `pointercancel`** ([`src/physics/bootstrap.ts:132-149`](file:///Users/sagar/Developer/portfolio%20v2/src/physics/bootstrap.ts#L132-L149)):
  - Clears velocity on release. If drag becomes a scroll (`pointercancel`), cleanly sets `pen.seen = false` and zeros velocities.

### 2.4 Integration Strategy for Living Physics Sheet
- **Single Source of Truth**: The living sheet will read `pen.x, pen.y` (in viewport coordinates) and `pen.sp` directly from this shared state.
- **No Competing Listeners**: No secondary pointer listeners or cursor models will be created.
- **Dent Application**: On each fixed tick while pen/finger moves over the page, apply dent $h \mathrel{-}= \text{depth} \times \text{falloff}(d)$ within $R = 90\text{px}$ (desktop) / $110\text{px}$ (touch), with depth scaled by `pen.sp` and safely clamped.
- **Tap/Click Ripples**: Trigger wave impulse directly in the existing `pointerdown` handler or via the `shockwave` event.

---

## 3. Main Loop & Fixed-Timestep Accumulator

### 3.1 Location
- **Fixed Timestep**: `FIXED_DT = 1000 / 60 = 16.6667 ms` ([`src/physics/physics.ts:90`](file:///Users/sagar/Developer/portfolio%20v2/src/physics/physics.ts#L90)).
- **Engine Loop**: [`src/physics/bootstrap.ts:288-337`](file:///Users/sagar/Developer/portfolio%20v2/src/physics/bootstrap.ts#L288-L337).

### 3.2 Loop Structure
```ts
let last = performance.now();
let acc = 0;
let animId: number | null = null;

function loop(t: number): void {
  const frameDelta = t - last;
  checkAdaptiveQuality(frameDelta);

  acc += Math.min(frameDelta, 50); // Clamped to 50ms to prevent spiral of death
  last = t;

  while (acc >= FIXED_DT) {
    acc -= FIXED_DT;
    penStep(pen);
    stepInk(pen, t, H);
    stepCreatures(pen.x, pen.y, pen.sp, pen.seen, W, H);
    stepPortraitPhysics(pen, isCoarse, effectiveGx, effectiveGy, tiltActive);
    if (lettersReady) stepLetters(pen, isGrav, effectiveGx, effectiveGy);
    // Living sheet physics will step here!
  }

  draw(t); // Clears and draws canvas layers

  if (isTabVisible && isCanvasVisible) {
    animId = requestAnimationFrame(loop);
  } else {
    animId = null;
  }
}
```

### 3.3 Living Sheet Physics Integration
- Step formula:
  $$v_{i,j} \mathrel{+}= (\text{avg}_4(h) - h_{i,j}) \times 0.25$$
  $$v_{i,j} \mathrel{*}= 0.985$$
  $$h_{i,j} \mathrel{+}= v_{i,j}$$
  Edges fixed at $h = 0, v = 0$.
- Steps occur strictly inside the `while (acc >= FIXED_DT)` tick, guaranteeing identical wave propagation speed regardless of screen refresh rates (60Hz, 90Hz, 120Hz ProMotion).

---

## 4. Current Pausing Mechanisms (Tab Visibility & Off-Screen)

The codebase already implements disciplined resource management:

1. **Tab Hidden (`document.visibilitychange`)** ([`src/physics/bootstrap.ts:340-344`](file:///Users/sagar/Developer/portfolio%20v2/src/physics/bootstrap.ts#L340-L344)):
   - Checks `document.hidden`.
   - If hidden, invokes `stopLoop()`, executing `cancelAnimationFrame(animId)` and setting `animId = null`.
   - Zero CPU consumption when the tab is in the background.
2. **Canvas Off-Screen (`IntersectionObserver`)** ([`src/physics/bootstrap.ts:347-358`](file:///Users/sagar/Developer/portfolio%20v2/src/physics/bootstrap.ts#L347-L358)):
   - An `IntersectionObserver` tracks `#cv`. If it scrolls off-screen or is hidden, `isCanvasVisible = false` and `stopLoop()` halts `requestAnimationFrame`.
3. **Face SVG Eye-Tracking Culling** ([`src/physics/bootstrap.ts:218-225`](file:///Users/sagar/Developer/portfolio%20v2/src/physics/bootstrap.ts#L218-L225)):
   - An `IntersectionObserver` tracks the `.face` SVG; pupil DOM style writes are skipped when the face section is scrolled out of view.
4. **Letter Culling** ([`src/physics/letters.ts:133-138`](file:///Users/sagar/Developer/portfolio%20v2/src/physics/letters.ts#L133-L138)):
   - Letters displaced outside $[scrollY - 400, scrollY + innerHeight + 400]$ skip spring calculations and transform updates.
5. **Adaptive Quality Degradation** ([`src/physics/bootstrap.ts:261-276`](file:///Users/sagar/Developer/portfolio%20v2/src/physics/bootstrap.ts#L261-L276)):
   - Rolling 60-frame delta monitor; if average frame time $> 20\text{ms}$, reduces creature count, ink segment buffer, and dot portrait density by 50%.

### 4.1 Sheet-Specific Sleep & Zero Idle CPU Requirement
- The new sheet introduces a local sleep detector:
  $$\max(|h_{i,j}|, |v_{i,j}|) < 0.01$$
- When this condition is met:
  1. The sheet marks itself as `sleeping = true`.
  2. Renders one final static rest frame.
  3. Bypasses the wave step computation and canvas redraws entirely during the main loop.
- **Wake triggers**:
  - Pointer movement (`pen.sp > 0.5` or `pointermove`).
  - Tap / click (`pointerdown` impulse).
  - Scroll event (sheet absorbs initial parallax/velocity).
  - Device tilt angle change.
- Result: Idle page utilizes approximately 0% CPU.

---

## 5. Summary & Verification Plan for Phase 1

1. **Canvas Architecture**:
   - Add `<canvas id="sheet-cv" aria-hidden="true" tabindex="-1"></canvas>` fixed behind all content (`z-index: -1`, `pointer-events: none`).
   - Leave crease texture intact (`z-index: -2` or `-1`).
2. **Buffer Management**:
   - Continuous `Float32Array` buffers for $h, v$ dimensioned $(cols \times rows)$.
   - Viewport plus 1 cell margin on all sides.
   - Resize handler reallocates buffers on **width change only**, debounced at 200ms using `100dvh` and `visualViewport` (preserving buffers during mobile address bar height toggling). Device pixel ratio capped at 2.
3. **Rendering & Batching**:
   - Displace dots along the height gradient up to 6px.
   - Scale radius with height.
   - Batch all dot draws into 4 radius buckets (4 path fills per frame instead of thousands of individual fills).
4. **Zero Errors & No Regressions**:
   - Zero console errors, zero TypeScript errors.
   - Automated tests for wave steps, sleep convergence, and dent equations.

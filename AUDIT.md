# Codebase Audit — Portfolio v2
Date: October 2026  
Author: Senior Frontend Engineer  
Status: Phase 0 Completed — Pending User Approval  

---

## 1. How Existing Systems Work

### 1.1 Letters System (`src/physics/letters.ts` & `src/physics/physics.ts`)
- **DOM Splitting & Initialization**:
  - `initLetters()` queries all elements with class `.phys` (`h1`, `h2`, `.big.phys`, `p.phys`).
  - `splitElement()` uses `TreeWalker(SHOW_TEXT)` to traverse text nodes and split text into words and characters.
  - Words are wrapped in `<span class="w">` (`display: inline-block; white-space: nowrap`).
  - Characters are wrapped in `<span class="l">` (`display: inline-block; will-change: transform`).
  - Letters in `.hero` are initialized with an initial scatter above the viewport:
    - $x \in [-40, 40]\text{px}$
    - $y \in [-400, -150]\text{px}$
    - $r \in [-1, 1]\text{rad}$
  - A `LetterBody` object is created for each character holding: DOM element `e`, displacements $(x, y)$, velocities $(v_x, v_y)$, rotation $r$, angular velocity $v_r$, rest coordinates $(c_x, c_y)$ in document space, floor distance $fl$, section reference `sec`, active flag `on`, and near flag `nr`.
- **Measurement**:
  - `measureLetters()` measures the rest positions of all letters relative to document scroll:
    $c_x = b.\text{left} + b.\text{width}/2 + \text{scrollX} - \text{body}.x$  
    $c_y = b.\text{top} + b.\text{height}/2 + \text{scrollY} - \text{body}.y$  
    $fl = s.\text{bottom} - (b.\text{bottom} - \text{body}.y) - 8$
  - Reads are batched across all letters before any writes occur, preventing layout thrashing.
  - Currently called on `document.fonts.ready` and `window.addEventListener('resize')`.
- **Stepping & Physics**:
  - `stepLetters(pen, gravity)` runs on each 60 Hz accumulator tick.
  - Letters $>400\text{px}$ outside the vertical viewport ($y < \text{scrollY} - 400$ or $y > \text{scrollY} + \text{innerHeight} + 400$) are culled.
  - **Repulsion**: If pen has been seen, `repelStep()` calculates distance $d$ between pen and letter center:
    - If $d < R$ ($R = 85\text{px}$), force is:
      $$f = \left(1 - \frac{d}{R}\right)^2 \cdot (\text{pen.sp} \cdot 0.12 + 1.4)$$
    - Accelerates $v_x, v_y$ and applies angular torque $v_r \mathrel{+}= \frac{d_x}{d} \cdot f \cdot 0.006$.
  - **Normal Mode (Spring)**:
    - $v_x \mathrel{-}= x \cdot 0.05;\quad v_y \mathrel{-}= y \cdot 0.05;\quad v_x \mathrel{*}= 0.86;\quad v_y \mathrel{*}= 0.86;\quad x \mathrel{+}= v_x;\quad y \mathrel{+}= v_y$
    - $v_r \mathrel{-}= r \cdot 0.05;\quad v_r \mathrel{*}= 0.90;\quad r \mathrel{+}= v_r$
  - **Gravity Mode**:
    - $v_y \mathrel{+}= 0.7;\quad v_x \mathrel{*}= 0.8;\quad v_r \mathrel{*}= 0.6;\quad x \mathrel{+}= v_x;\quad y \mathrel{+}= v_y;\quad r \mathrel{+}= v_r$
    - Floor collision: if $y > fl$, clamps $y = fl$, bounces $v_y \mathrel{*}= -0.45$, stops if $|v_y| < 1$.
  - **Rest Detection**:
    - If $|x| + |y| + |v_x| + |v_y| + |r| \cdot 40 < 0.05$, the letter is considered at rest.
    - Transform is cleared (`style.transform = ''`), class `.near` removed, and updates cease until perturbed.

---

### 1.2 Pen System (`src/physics/physics.ts` & `src/physics/ink.ts`)
- **State (`PenState`)**:
  - Mass-on-a-spring tracking target pointer $(t_x, t_y)$ with current $(x, y)$, previous $(o_x, o_y)$, velocity $(v_x, v_y)$, speed $sp$, stroke width $w$, idle counter `idle`, resting bead radius `bead`, and visibility flag `seen`.
- **Physics Step (`penStep`)**:
  - Target spring: $v_x = (v_x + (t_x - x) \cdot 0.2) \cdot 0.62$, $v_y = (v_y + (t_y - y) \cdot 0.2) \cdot 0.62$
  - Position: $x \mathrel{+}= v_x$, $y \mathrel{+}= v_y$, $sp = \sqrt{v_x^2 + v_y^2}$.
- **Input Listeners**:
  - `pointermove`: sets target $(t_x, t_y)$ and initializes $(x, y)$ on first sighting.
  - `pointerdown`: sets target $(t_x, t_y)$, spawns ink blot.
- **Rendering**:
  - Draws a fountain pen nib at $(x, y)$ rotated $0.5\text{ rad}$ with paper fill and ink outline.

---

### 1.3 Canvas & Ink System (`src/physics/ink.ts` & `src/physics/bootstrap.ts`)
- **Canvas Element (`#cv`)**:
  - Fixed full-screen overlay: `position: fixed; inset: 0; pointer-events: none; z-index: 5`.
  - Scaled by `dpr = Math.min(devicePixelRatio || 1, 2)`.
- **Ink Trails**:
  - When $sp > 0.3$: target stroke width is $\max(1.2, 7 - sp \cdot 0.35)$, smoothed with factor $0.3$.
  - Line segments recorded as `{ a, b, c, d, w, t }`, capped at 1200 segments.
  - Segments fade linearly over $5000\text{ ms}$: `globalAlpha = 1 - (now - t) / 5000`.
- **Idle Bead & Drips**:
  - When $sp \le 0.3$: `idle` counter increments. After 20 frames, bead grows at $0.04/\text{frame}$ up to radius 8.
  - When `bead >= 7`, a drip `{ x, y, vy: 0, w: 6 }` is spawned.
  - Drips accelerate downward $v_y \mathrel{+}= 0.12$, thin by $0.04/\text{frame}$, and leave trail segments.
- **Ink Blots**:
  - Spawned on `pointerdown`: radius $R \in [22, 38]\text{px}$, 18-vertex irregular polygon with random radial perturbations.
  - Expands radius $r = R \cdot \sqrt{\min(1, \text{age}/800)}$ over $800\text{ ms}$, fades over $6000\text{ ms}$ with base alpha 0.85.
  - 60% probability of spawning a creature via `born(x, y, W, H)`.
- **Eye-Tracking**:
  - SVG face in skills section has circles `#eye-l` and `#eye-r`.
  - Calculates angle from eye centers to $(pen.x, pen.y)$, offsets pupil by $\min(7, d/25)\text{px}$.

---

### 1.4 Creatures System (`src/physics/creatures.ts`)
- **State**:
  - Array `cells: Creature[]`, capped at 22 creatures.
  - Initialized with 6 creatures scattered across the viewport.
  - Each creature tracks $(x, y)$, $(v_x, v_y)$, heading angle $a$, wobble phase $ph$, and radius $r \in [13, 21]\text{px}$.
- **Stepping (`stepCreatures`)**:
  - Wobble phase advances: $ph \mathrel{+}= 0.06$.
  - Heading random walk: $a \mathrel{+}= \text{rnd}(-0.12, 0.12)$.
  - Baseline steering: $s_x = \cos(a) \cdot 0.9$, $s_y = \sin(a) \cdot 0.9$.
  - Interaction with pen:
    - If pen speed $> 9$ and distance $< 220\text{px}$: flees ($s \mathrel{-}= \hat{d} \cdot 4$).
    - If pen speed $< 1.5$ and $70 < d < 340\text{px}$: approaches resting pen ($s \mathrel{+}= \hat{d} \cdot 1.4$).
  - Velocity smoothed towards steering: $v \mathrel{+}= (s - v) \cdot 0.06$.
  - Toroidal boundary wrapping at viewport bounds $\pm 40\text{px}$.
- **Rendering (`drawCreatures`)**:
  - 12-segment closed polygon with double harmonic wobble:
    $$r(\theta) = k.r \cdot (1 + 0.14\sin(3\theta + ph) + 0.08\sin(2\theta - 1.3ph))$$
  - Stroked in `var(--ink)` with opacity 0.85 and line width 1.6.
  - Two pupil dots drawn in the direction of heading $\text{atan2}(v_y, v_x)$.

---

## 2. Audit of Hover, Mouse, 100vh, Cursor & Desktop-Only Logic

| File & Line | Code / Selector | Issue / Desktop-Only Assumption | Phase 1 Mobile Remediation |
|---|---|---|---|
| `src/style.css:110-118` | `@media (pointer: fine) { cursor: none; }` | Cursor is hidden on mouse devices, but pen graphic in canvas is drawn for all devices regardless of pointer type. | Hide canvas pen graphic on `(pointer: coarse)`. |
| `src/style.css:123` | `min-height: 100svh;` | Uses `100svh` instead of modern `100dvh`. On mobile, address bar showing/hiding causes jitter. | Update to `100dvh` and integrate `visualViewport` listener. |
| `src/style.css:47, 128, 134, 284, 484` | `--section-pad-v: 9vh; gap: 3vh; inset: 3vh 3vw; margin-top: 2vh; padding: 8vh 6vw;` | Uses standard `vh` units which shift when browser chrome animates. | Harmonize with dynamic viewport tokens and safe areas. |
| `src/style.css:226` | `button:hover` | Sticks on touch devices after tap. | Ensure `:hover` styles only apply under `@media (hover: hover)`. Use `:focus-visible` and `:active` for touch feedback. |
| `src/style.css:364` | `.project-card:hover` | Sticks card hover background on mobile tap. | Wrap hover in `@media (hover: hover)`. |
| `src/style.css:410` | `.project-link:hover` | Sticky hover underline on touch. | Wrap hover in `@media (hover: hover)`. |
| `src/style.css:445` | `.ink-link:hover` | Sticky hover on links after touch. | Wrap hover in `@media (hover: hover)`. |
| `src/main.ts:82` | `document.addEventListener('pointerover', ...)` | Triggers marker highlight on hover/touch drag. On touch, pointerover fires erratically during scroll. | Add `touch-action: pan-y` so vertical scroll is smooth and doesn't trigger spurious highlights. |
| `src/physics/bootstrap.ts:61` | `addEventListener('pointermove', ...)` | Non-passive listener; no check for `pointerType`; lags behind touch finger due to pen spring filter. | Use `{ passive: true }`. On touch, follow finger directly with zero spring lag. |
| `src/physics/bootstrap.ts:71` | `addEventListener('pointerdown', ...)` | Non-passive listener; does not handle multi-touch or pointer cancellation. | Use `{ passive: true }`. Add `pointerup` and `pointercancel` listeners to prevent stuck states. |
| `src/physics/bootstrap.ts:79` | `addEventListener('resize', () => { sizeCanvas(); measureLetters(); })` | Raw un-debounced resize fires on every scroll frame when mobile browser address bar shows/hides, causing full letter re-measurement and potential transform resets. | Debounce 200 ms; ignore height-only resizes if width didn't change; use `visualViewport`; never reset active transforms. |
| Global Page | Missing `touch-action` | Page lacks `touch-action: pan-y`, meaning browser may delay scroll or fight touch events. | Add `touch-action: pan-y` on `html`, `body`, and interactive canvas layers. |
| Letter Spans | Missing mobile tap styling | Missing `-webkit-tap-highlight-color: transparent` and `user-select: none`. | Add `-webkit-tap-highlight-color: transparent` and `user-select: none` on `.l` and `.w`. |

---

## 3. Audit of Per-Frame DOM Writes

Every animation frame (`requestAnimationFrame(loop)`):

1. **Letter Transforms (`src/physics/letters.ts:186`)**:
   - `body.e.style.transform = \`translate(${body.x.toFixed(1)}px,${body.y.toFixed(1)}px) rotate(${body.r.toFixed(3)}rad)\``
   - **Occurs**: Every tick (up to 60 Hz) for every displaced letter within the 400px viewport margin.
   - **Optimization needed**: Only write if $(x, y, r)$ actually changed from the previous frame. Avoid layout thrashing by ensuring no DOM reads occur between letter transform updates.
2. **Letter Class Toggles (`src/physics/letters.ts:182`)**:
   - `body.e.classList.toggle('near', !!displaced)`
   - **Occurs**: Checked per frame, writes only when state changes (`displaced !== body.nr`).
3. **Letter Rest Cleanup (`src/physics/letters.ts:158-160`)**:
   - `body.e.style.transform = ''; body.e.classList.remove('near');`
   - **Occurs**: One-time write when a letter settles into resting state.
4. **SVG Eye Tracking (`src/physics/bootstrap.ts:120`)**:
   - `eye.style.transform = \`translate(${(dx / d) * m}px,${(dy / d) * m}px)\`` on `#eye-l` and `#eye-r`.
   - **Occurs**: Every single frame when pen has been seen!
   - **Optimization needed**: Only write if the pupil delta changed by $>0.1\text{px}$, and skip when the eye section is off-screen.
5. **Canvas Overdraw (`src/physics/bootstrap.ts:127-132`)**:
   - Canvas 2D context clearing and re-stroking.
   - **Optimization needed**: Use `IntersectionObserver` to pause canvas rendering when off-screen, and listen to `document.visibilitychange` to halt the loop completely when the tab is hidden.

---

## 4. The Projects Section: Cause of Empty Content & Build-Time Solution

### 4.1 Why the Projects Section Rendered With No Content on the Live Page
1. **Empty Static HTML Source**:
   - In `index.html`, `<div class="project-grid" id="project-grid">` contains zero child elements:
     ```html
     <section id="sec-projects">
       <h2 class="phys" aria-label="projects">projects</h2>
       <div class="project-grid" id="project-grid">
         <!-- Populated by main.ts from projects.json -->
       </div>
     </section>
     ```
   - When delivered over HTTP from Vercel, the HTML payload contains no project cards.
2. **Client-Side Rendering Dependency**:
   - The projects are inserted entirely by client-side JavaScript in `main.ts`:
     ```ts
     const grid = document.getElementById('project-grid');
     if (grid) {
       for (const proj of projects) { ... }
     }
     ```
   - In production, Vite bundles this logic into `assets/index-ZzzzNVAM.js` and injects it into `<head>`.
   - If JavaScript is slow to load, blocked by privacy extensions/ad-blockers, fails due to any preceding runtime issue, or if the page is viewed by a bot, web scraper, or mobile browser under low-power/low-bandwidth conditions before script execution completes, the section is completely blank.
   - Furthermore, client-side DOM insertion triggers Cumulative Layout Shift (CLS) as cards pop in after paint.

### 4.2 Repositories Pulled from GitHub (`https://github.com/mahendrapratap23`)
Direct query to the GitHub REST API (`https://api.github.com/users/mahendrapratap23/repos`) yields the following public repositories:

| Repo Name | Language | Stars | Pushed Date | GitHub Description | Notes / Resume Cross-Check |
|---|---|---|---|---|---|
| **MEMORA** | Python | 1 | 2026-09-02 | *MEMORA is an open-source personal AI assistant and autonomous agent engineered from scratch* | Featured project in resume (6-layer architecture, SQLite memory, provider-agnostic LLM interface) |
| **portfolio01** | CSS | 1 | 2026-10-01 | *MINIMAL UI PORtFOLIO* | In existing `projects.json` as "portfolio" |
| **droidbridge** | Rust | 0 | 2026-09-28 | *Universal Android-to-macOS file transfer over USB* | In existing `projects.json` |
| **trackly** | TypeScript | 0 | 2026-07-31 | *an idea that track anything what you want ,graph visuals* | Featured project in resume (Local-first habit & metric analytics, IndexedDB/LocalStorage, Recharts) |
| **ghumo-ai** | TypeScript | 0 | 2026-07-18 | *travel tracker ,maps ,checklist,budgets,most everything for travel planning* | Featured project in resume (AI travel planner, Gemini API, React Leaflet, Recharts) |
| **college-practical-codes** | Jupyter Notebook | 0 | 2026-10-08 | *machine learning ,DAA ,AI codes practicals* | In existing `projects.json` |
| **Course-Outcome-Analyzer** | Python | 0 | 2026-10-07 | *None* | Academic analytics tool |
| **Boundless-Canvas** | JavaScript | 0 | 2026-09-06 | *None* | Interactive canvas project |
| **airqr** | JavaScript | 0 | 2026-09-24 | *None* | Utility project |
| **SElab** | Python | 0 | 2026-09-29 | *None* | Software Engineering coursework |
| **portfolio-v2** | TypeScript | 0 | 2026-10-08 | *None* | This portfolio repository |

### 4.3 Proposed Build-Time Fix (Zero Invented Content)
1. **Build-Time Generation**: A build script (`scripts/build-projects.ts` or Vite HTML plugin) will run during `npm run build`:
   - Fetches the verified repository metadata or reads cached GitHub repository data.
   - Pre-renders the exact semantic HTML `<article class="project-card">` markup directly inside `<div id="project-grid">` in `index.html`.
2. **Static Hydration Fallback**:
   - The HTML is pre-populated in the build artifact so it renders instantly with zero layout shift and zero dependence on client JavaScript execution.
   - `main.ts` will check `if (grid && grid.children.length === 0)` so it only injects dynamically if the grid was somehow empty.

---

## 5. Additional Key Findings

1. **Missing Asset**: `/public/images/head-bw-cutout.png` does not currently exist in the repository (directory `/public/images` does not exist). The user must provide this file or confirm its location before Phase 2 dot sampling can execute.
2. **Touch Targets**: Several buttons and links (`#g`, `.project-link`, `.ink-link`) need explicit minimum `44x44px` hit areas for mobile compliance.
3. **DeviceOrientation**: Tilt mode must follow strict iOS permission gating (`DeviceOrientationEvent.requestPermission()`).
4. **Adaptive Quality**: FPS monitoring over 60 frames to halve creature count and segment caps if average frame time $>20\text{ms}$.

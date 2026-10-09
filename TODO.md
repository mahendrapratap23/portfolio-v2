# Portfolio Enhancement Checklist & Audit

## 1. Assets
- [x] **`/public/images/head-bw-cutout.png`**: Copied from `reference/ChatGPT Image Oct 9, 2026, 12_31_31 AM.png` into `/public/images/head-bw-cutout.png` without any alteration.
- [x] **`/public/favicon.ico`** & **`/public/robots.txt`**: Created and linked for full SEO and browser compliance.

## 2. Project List Confirmation
Confirmed 6 projects from GitHub / Resume:
- [x] 1. **MEMORA** (Python) — "Open-source autonomous AI agent engine built from scratch. Six-layer architecture, provider-agnostic LLM interface."
- [x] 2. **ghumo-ai** (TypeScript) — "AI-powered travel planner with interactive maps, budget charts, and itinerary export."
- [x] 3. **trackly** (TypeScript) — "Privacy-first local habit and metric analytics suite with offline-first storage and rich chart dashboards."
- [x] 4. **droidbridge** (Rust) — "Universal Android-to-macOS file transfer over USB."
- [x] 5. **portfolio01** (CSS) — "Minimal UI portfolio site with clean typography and intentional whitespace."
- [x] 6. **college-practical-codes** (Jupyter Notebook) — "Machine learning, DAA and AI practical code notebooks from coursework."

## 3. Experience Copy Clarification
- [x] Updated Experience section to **BISAG-N** (Bhaskaracharya National Institute for Space Applications and Geo-informatics, Gandhinagar, Gujarat) from resume.

## 4. Phase 0: Initial Audit & Discovery
- [x] Audited letter physics, pen trail, canvas renderers, creatures, DOM writes, and desktop-only assumptions.
- [x] Identified empty project grid bug and created static pre-render pipeline.
- [x] Delivered `/AUDIT.md` and `/CONTENT-CHECK.md`.

## 5. Phase 1: Mobile Touch Smoothness & Base Interaction
- [x] Converted mouse events to unified passive pointer events across all interactive surfaces.
- [x] `touch-action: pan-y` on html, body, and canvas to allow smooth native vertical scrolling while catching pointer interactions.
- [x] Minimum 44x44px touch targets on buttons (`#g`, `#btn-tilt`, `#btn-portrait-mode`) and interactive links.
- [x] Fountain pen nib hidden on touch devices; finger tracking has zero spring lag.
- [x] `pointercancel` cleanly releases drag state on gesture handoffs.
- [x] Transforms written only when letters/entities are active; loops pause on `visibilitychange` and off-screen scroll.
- [x] Rolling 60-frame adaptive quality scaling halving particle counts if frame time exceeds 20ms.
- [x] Device tilt mode with iOS `DeviceMotionEvent.requestPermission()` trigger.

## 6. Phase 2: Dot Portrait + Name Morph
- [x] Offscreen canvas luminance-based sampling of `head-bw-cutout.png` into dot target grid.
- [x] Offscreen handwriting font rendering of "mahendra pratap" into name target grid.
- [x] Dual-buffer coordinate mapping with zero per-frame allocation via `Float32Array`.
- [x] 3-state toggle cycle: `PORTRAIT` ("who is this?") -> `NAME` ("show me") -> `PHOTO` ("dissolve" crossfade) -> `PORTRAIT`.
- [x] Physics interactions: Spring 0.06, damping 0.85, pen/touch repel radius 110px/140px, radial shockwaves on state transition, micro-jitter shimmer.
- [x] Hero headline name identity added with letter physics. Original doodle eyes SVG preserved.

## 7. Living Physics Sheet Membrane Background
- [x] **Phase 0 Audit (`/AUDIT-GRID.md`)**: Audited current CSS dot grid, crease texture, shared pointer state, 60 Hz accumulator loop, and pausing mechanisms.
- [x] **Fixed Background Canvas (`#sheet-cv`)**: Fixed behind all content (`z-index: 0`, sections at `z-index: 1`, `pointer-events: none`, `aria-hidden="true"`). Zero dots drawn over text.
- [x] **CSS Tokens & Fallback Grid**: Added `--grid: 28px` (desktop) / `34px` (touch) and `--dot: color-mix(...)`. Fixed `.crease-layer` and `.bg-grid` active as static fallback under `prefers-reduced-motion` or canvas failure.
- [x] **Physics Heightfield & Wave Step**: Discrete 2D wave step per fixed 60 Hz tick ($v \mathrel{+}= (\text{avg}_4 - h) \times 0.25$; $v \mathrel{*}= 0.985$; $h \mathrel{+}= v$). Edges fixed to 0.
- [x] **Pen Dents**: Moving pen or finger presses smooth elastic dent ($R = 90\text{px}$ desktop / $110\text{px}$ touch), depth scaled by speed and clamped. Uses shared `pen` singleton.
- [x] **Click / Tap Ripples**: Radial wave impulses triggered on existing `pointerdown` path, radiating outward and fading.
- [x] **Batched Rendering**: Dots displaced laterally along height gradient (up to 6px) and scaled in radius. Batched into 4 size buckets with 4 path fills per frame.
- [x] **Idle Sleep / Zero CPU**: When total energy drops below 0.01 and pen is still, draws one static frame and enters sleep mode. Wakes on pointermove, tap, scroll, or tilt.
- [x] **Debounced Width-Only Resize**: Reallocates fields on width change only (debounced 200ms). Mobile address bar height changes do not reallocate buffers.
- [x] **Mobile Touch Smoothness**: Passive listeners throughout. `touch-action: pan-y` preserved. Vertical swipe scrolls normally, horizontal drag dents sheet, tap ripples, `pointercancel` cleanly releases state.
- [x] **Adaptive Quality**: Monitors rolling 60 frames. Above 20ms, doubles grid step and cuts particle counts and wave iterations in half. Above 28ms, drops to static CSS grid.
- [x] **Tab Visibility Pausing**: Halts execution when tab is hidden (`document.hidden`). Zero background CPU.
- [x] **Grid Dot Caps**: Desktop capped at $\sim 4000$ dots; coarse touch capped at $\sim 1200$ dots.
- [x] **Tilt Accelerometer**: Supported with slope bias when tilt mode is active.
- [x] **Phase 3 (Letters Ride the Waves)**: Letters in viewport sample $h$ at rest position, adding $h \times 8\text{px}$ to vertical transform and $h \times 0.02\text{rad}$ to rotation. Verified sustained **61.1 FPS** on 4x CPU slowdown mobile profile.

## 8. Final Acceptance Verification Table

| Acceptance Item | Spec Requirement | Measured Result | Status |
|---|---|---|---|
| **At Rest Visuals** | Identical look, text contrast $\ge 4.5:1$, no layout shift | Contrast $> 16:1$ in light & dark modes; 0 layout shift | **PASS** |
| **Desktop Dent & Ripple** | Pen dents sheet, springs back; click ripples outward | Dent $-1.85\text{px}$, ripple energy $33.06$ | **PASS** |
| **Idle Sleep & CPU** | Stops loop at energy $< 0.01$, wakes on movement | Energy drops to $0.00$; `{ awake: false, sleeping: true }` verified | **PASS** |
| **Mobile 4x Throttled FPS** | Emulation at 360, 390, 768px with 4x CPU slowdown $\ge 30$ FPS | **61.1 FPS** (measured over 74 moving frames) | **PASS** |
| **Horizontal Overflow** | Zero overflow from 320px to 2560px | 0px overflow across all 10 viewport widths | **PASS** |
| **Reduced Motion** | Static CSS grid only, no canvas loop | Canvas `display: none !important;`, fallback `.bg-grid` active | **PASS** |
| **Tab Visibility Pause** | Pauses loop when tab is hidden | Verified via `visibilitychange` handler | **PASS** |
| **No Dots Over Text** | Canvas is strictly behind all content | `elementFromPoint` over `h1` returns `SPAN.l` (`z-index: 1` vs `0`) | **PASS** |
| **Console Errors & Warnings** | Zero errors and zero warnings | **0 errors, 0 warnings** across dev & preview | **PASS** |
| **Lighthouse Audit** | Performance, Accessibility, Best Practices, SEO $\ge 90$ | **99 / 100 / 100 / 100** | **PASS** |
| **Unit Tests** | All Vitest tests passing | **47 / 47 passing** (Vitest) | **PASS** |

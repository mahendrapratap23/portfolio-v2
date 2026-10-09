# Portfolio — Mahendra Pratap

> A handwritten, physics-driven personal portfolio engineered with hand-written 60 Hz accumulator physics, an interactive dot portrait name morph, tilt accelerometer dynamics, and zero runtime dependencies.

Live site: [https://portfolio-v2-sand-kappa.vercel.app/](https://portfolio-v2-sand-kappa.vercel.app/)  
GitHub: [https://github.com/mahendrapratap23](https://github.com/mahendrapratap23)

---

## Highlights & Features

- **Living Physics Sheet Membrane Background (`src/physics/sheet.ts`)**:
  - The dot-grid paper background is a live physics membrane with discrete 2D heightfield $h$ and velocity field $v$ in `Float32Array` buffers.
  - Moving pen or finger presses a smooth elastic dent into the membrane ($R = 90\text{px}$ desktop / $110\text{px}$ touch), scaling with pen speed.
  - Taps or clicks emit radial wave impulses that ripple across the dots and fade at the boundary.
  - Dots displace laterally along the height gradient (up to 6px) and scale their radius with height (pressed shrink, raised grow).
  - Batched rendering into 4 size buckets requires only 4 path fills per frame.
  - **Zero Idle CPU**: When total wave energy drops below 0.02 and pointer is stationary, the sheet renders one static frame and enters sleep mode. Wakes instantly on pointer move, tap, scroll, or device tilt.
  - **Letters Ride the Waves (Phase 3)**: Displaced letters sample the underlying membrane height $h$, smoothly lifting by $h \times 8\text{px}$ and tilting by $h \times 0.02\text{rad}$.
  - **Graceful Fallbacks**: Under `prefers-reduced-motion: reduce`, no JS, or canvas failure, the canvas hides and the static CSS `radial-gradient` dot grid activates seamlessly.
- **Dot Portrait & Name Morph (`src/physics/portrait.ts`)**:
  - Samples black-and-white cutout (`/public/images/head-bw-cutout.png`) via offscreen canvas with luminance-based dot radius.
  - Generates dual target coordinates: **Portrait face** configuration and handwritten **"mahendra pratap"** name configuration.
  - Three-state toggle cycle:
    1. **Portrait**: Ink dots settle into the face silhouette, reacting elastically to pen and finger movements.
    2. **Name**: Dots morph smoothly along spring trajectories into the handwritten name.
    3. **Photo**: Real cutout photograph crossfades in while dots dissolve out.
  - Physics interactions: Spring 0.06, damping 0.85, pen repel radius 110px (140px on touch), radial shockwave impulses, idle micro-shimmer.
  - Fully backed by zero-allocation `Float32Array` buffers (positions, velocities, target coordinates, radii, alphas).
- **Mobile Touch Smoothness**:
  - Passive Pointer Events across all inputs with `touch-action: pan-y` preventing gesture interception.
  - Zero-lag finger tracking on touch devices; fountain pen nib graphic automatically hidden.
  - Hardware-accelerated transforms written only when elements are actively in motion.
  - Frame rate preservation: fixed 60 Hz accumulator physics with adaptive quality scaling (halves entity density if frame drops below 20ms).
- **Tilt Mode (Device Orientation)**:
  - Accelerometer-driven directional gravity ($g_x, g_y$) responding to device tilt angle.
  - Applies a gentle slope bias across the sheet so ripples roll downhill.
  - iOS 13+ permission support via `DeviceMotionEvent.requestPermission()` trigger on user gesture.
- **Projects & Work**:
  - Pre-rendered at build time in `index.html` for instant first paint and SEO indexability.
  - Experience reflects Software Engineering Intern role at **BISAG-N** (Gandhinagar, Gujarat).
- **Performance & Accessibility**:
  - **Lighthouse Scores**: Performance 99, Accessibility 100, Best Practices 100, SEO 100.
  - Bundle size: ~10.5 KB total JS gzipped (`index.js` 2.58 KB + `bootstrap.js` 8.00 KB).
  - WCAG AAA compliance, accessible touch targets (min 44x44px), semantic landmarks (`<main id="main">`, `<header>`, `<footer>`), valid `robots.txt`, and full favicon support.

---

## Configuring the Living Physics Sheet

All sheet physics parameters can be configured in [`src/physics/sheet.ts`](file:///Users/sagar/Developer/portfolio%20v2/src/physics/sheet.ts) and [`src/style.css`](file:///Users/sagar/Developer/portfolio%20v2/src/style.css):

| Parameter | Location | Default Value | Description |
|---|---|---|---|
| **Dot Spacing** | `src/style.css:46, 61` | `--grid: 28px` (desktop), `34px` (touch) | Spacing token for dots; reallocated on width change. |
| **Dot Color** | `src/style.css:45` | `var(--dot)` (`18%` ink mix) | Color token re-read on theme change. |
| **Dent Strength & Radius** | `src/physics/sheet.ts:133-134` | Depth $\le 3.2$, $R = 90\text{px}$ / $110\text{px}$ | Depth formula `Math.min(3.2, 0.5 + sp * 0.16)` scaled by pen speed. |
| **Ripple Impulse** | `src/physics/sheet.ts:173` | Strength `4.5`, Radius `60px` | Instantaneous downward velocity imparted on click/tap. |
| **Wave Speed (Coupling)** | `src/physics/sheet.ts:259` | Factor `0.25` | Wave acceleration coupling to 4 neighbours. |
| **Wave Damping** | `src/physics/sheet.ts:269, 274` | $v \mathrel{*}= 0.985$, $h \mathrel{*}= 0.982$ | Decay multiplier per 60 Hz tick controlling how fast ripples settle. |
| **Sleep Threshold** | `src/physics/sheet.ts:281` | Energy $< 0.02$ | Energy threshold below which sheet sleeps for zero CPU. |
| **Letter Wave Riding** | `src/physics/letters.ts:195-196` | $h \times 8\text{px}$, $h \times 0.02\text{rad}$ | Vertical and angular ride displacement for visible letters. |

---

## Tech Stack

- **Scaffold**: Vite + Vanilla TypeScript + Plain CSS
- **Typography**: Custom handwriting typeface (`Myfont-Tight.ttf`) with targeted `Caveat` fallback via `unicode-range` for uncovered symbols
- **Physics Engine**: Hand-written fixed-timestep 60 Hz accumulator physics (zero runtime dependencies)
  - Letter spring dynamics (spring 0.05, damping 0.86)
  - Rotation spring dynamics (spring 0.05, damping 0.9)
  - Pen mass-on-a-spring follower (spring 0.2, damping 0.62)
  - Gravity toggle mode with floor collision and bounce
  - Device tilt mode with 2D gravity vector
  - Interactive dot portrait name morph with shockwaves
  - Canvas ink trail, drips, and ink blots
  - Wobbly autonomous blob creatures with eye orientation
  - Interactive pupil tracking on hand-drawn SVG face
  - Oulipo marker highlighter on touch/hover

---

## How to Update Copy

All portfolio content is structured and synchronized between:
1. **`src/data/content.ts`**: Centralized TypeScript source of truth for:
   - Bio copy and headline
   - Projects (titles, tags, URLs, descriptions)
   - Work experience (role, organization, period, description)
   - Contact links
2. **`index.html`**: Pre-rendered semantic HTML matching `src/data/content.ts` for zero layout shift and instant indexing.
   - When modifying project or bio copy, update both `src/data/content.ts` and the corresponding sections in `index.html`.

---

## Getting Started

### Install Dependencies
```bash
npm install
```

### Run Locally
```bash
npm run dev
```

### Run Tests
```bash
npm test
```
Executes all 41 unit tests covering physics constants, spring dynamics, gravity, bounces, pen motion, touch behavior, tilt physics, and portrait buffer sampling.

### Build for Production
```bash
npm run build
```

---

## Project Structure

```
├── public/
│   ├── favicon.ico              # Multi-resolution favicon
│   ├── images/
│   │   └── head-bw-cutout.png   # Portrait cutout image for dot sampling
│   ├── fonts/                   # Self-hosted handwriting & fallback fonts
│   └── robots.txt               # Crawler directives
├── src/
│   ├── data/
│   │   ├── content.ts           # Single source of truth for projects & bio
│   │   └── projects.json        # Build-time frozen top 6 GitHub repos
│   ├── physics/
│   │   ├── bootstrap.ts         # 60 Hz accumulator loop & physics wiring
│   │   ├── creatures.ts         # Wobbly blob creatures & behaviors
│   │   ├── ink.ts               # Canvas ink trail, bead, drips & blots
│   │   ├── letters.ts           # Letter DOM splitting & spring stepping
│   │   ├── physics.ts           # Pure physics constants & formulas
│   │   ├── physics.test.ts      # Comprehensive Vitest unit test suite (41 tests)
│   │   └── portrait.ts          # Dot portrait sampling, buffers, and morph engine
│   ├── main.ts                  # App bootstrap, project cards, marker events
│   └── style.css                # CSS design system tokens, typography & dark theme
├── index.html                   # Semantic HTML with accessibility landmarks
├── vercel.json                  # Deployment configuration for Vercel
└── vite.config.ts               # Vite configuration
```

# Codebase Audit — Portfolio v2
**Date:** October 2026  
**Author:** Senior Creative Frontend Engineer  
**Status:** Phase 0 Audit Complete — Awaiting User Approval of Repo List  

---

## 1. System Architecture & Component Locations

### 1.1 Pointer & Pen State
- **State Definition**: Located in [`src/physics/physics.ts`](file:///Users/sagar/Developer/portfolio%20v2/src/physics/physics.ts) under the `PenState` interface:
  ```ts
  export interface PenState {
    x: number; y: number;       // Current smoothed pointer position
    ox: number; oy: number;     // Previous position
    tx: number; ty: number;     // Target pointer position from input events
    vx: number; vy: number;     // Velocity vector
    sp: number;                 // Speed scalar = hypot(vx, vy)
    w: number;                  // Current ink stroke width
    idle: number;               // Idle frame counter for bead growth
    bead: number;               // Ink bead radius (drips when >= 7)
    seen: boolean;              // True once pointer has entered viewport
    isTouch: boolean;           // True if active pointer device is touch
  }
  ```
- **State Instance & Unified Input Listeners**: Held in [`src/physics/bootstrap.ts`](file:///Users/sagar/Developer/portfolio%20v2/src/physics/bootstrap.ts):
  - Passive pointer listeners attached to `window`: `pointerdown`, `pointermove`, `pointerup`, `pointercancel`, `pointerleave`.
  - Spring smoothing step: `penStep(pen)` updates `pen.vx`, `pen.vy`, and `pen.sp` on each fixed physics tick ($spring = 0.2$, $damping = 0.62$). On touch devices, spring lag is zeroed out for direct 1:1 finger tracking.
  - No competing or duplicate cursor listeners exist.

### 1.2 Main Loop & Fixed-Timestep Accumulator
- **Implementation**: Located in [`src/physics/bootstrap.ts`](file:///Users/sagar/Developer/portfolio%20v2/src/physics/bootstrap.ts) (`raf()` function):
  - Fixed-timestep accumulator: `FIXED_DT = 1000 / 60` ($16.667\text{ ms}$).
  - Accumulates elapsed delta time $dt$, clamping at $100\text{ ms}$ to prevent spiral of death on tab refocus.
  - Dispatches exact fixed steps:
    1. `penStep(pen)`
    2. `stepLetters(pen, gravityOn, tiltGx, tiltGy)`
    3. `stepInk(pen, now, W, H)`
    4. `stepCreatures(W, H, pen.x, pen.y, pen.sp, pen.seen)`
    5. `sheet.stepPhysics(pen, tiltGx, tiltGy, tiltActive)`
    6. `stepPortraitPhysics(pen.x, pen.y, pen.sp, pen.seen)`
  - Renders all active canvas layers during the frame.
- **Resource Management & Pausing**:
  - `document.addEventListener('visibilitychange')`: Suspends accumulator when tab is hidden (`document.hidden`).
  - Section culling: Letters $>400\text{px}$ off-screen skip stepping; pupil eye-tracking uses `IntersectionObserver` on `.face` to pause writes when off-screen; `LivingSheet` membrane enters sleep mode when maximum absolute velocity $<0.01$.

### 1.3 Creatures System
- **State & Logic**: Located in [`src/physics/creatures.ts`](file:///Users/sagar/Developer/portfolio%20v2/src/physics/creatures.ts):
  - Array `cells: Creature[]`, capped at 22 creatures (adaptive quality drops cap to 11 if frames exceed $20\text{ ms}$).
  - Physics step `stepCreatures`:
    - Move toward resting pen ($sp < 1.5$, distance $\in [70, 340]\text{px}$).
    - Flee rapidly moving pen ($sp > 9$, distance $< 220\text{px}$).
    - Smooth steering: $v_x \mathrel{+}= (s_x - v_x) \cdot 0.06$, $v_y \mathrel{+}= (s_y - v_y) \cdot 0.06$.
    - Screen edge wrapping with $40\text{px}$ margin.
  - Drawing `drawCreatures`:
    - Hand-drawn wobbly outline: 12-vertex sinusoidal polar radius ($r \cdot (1 + 0.14\sin(3\theta + \phi) + 0.08\sin(2\theta - 1.3\phi))$).
    - Two eyes oriented toward heading angle $\theta = \operatorname{atan2}(v_y, v_x)$ using `var(--ink)`.

### 1.4 Letters Physics
- **DOM Splitting & Tracking**: Located in [`src/physics/letters.ts`](file:///Users/sagar/Developer/portfolio%20v2/src/physics/letters.ts):
  - Traverses `.phys` elements with `TreeWalker(SHOW_TEXT)`, splitting words into `<span class="w">` and characters into `<span class="l">`.
  - Tracks character rest document coordinates $(c_x, c_y)$ measured via batched reads (`measureLetters()`).
  - Physics step `stepLetters`:
    - Repulsion: Pen repels letters within $R = 85\text{px}$ with force $f = (1 - d/R)^2 \cdot (sp \cdot 0.12 + 1.4)$ and applies rotational torque.
    - Spring recovery: Displaced letters pull back toward rest origin ($spring = 0.05$, $damping = 0.86$, rotation spring $0.05$, rotation damping $0.90$).
    - Sleep detection: When displacement and velocity drop below $0.05$, `transform` is cleared to release GPU compositor layers.

---

## 2. How Sections are Built

All content lives in semantic HTML elements inside `<main id="main">` in [`index.html`](file:///Users/sagar/Developer/portfolio%20v2/index.html):
- Each section is a full-height or content-fitted `<section id="...">` with standard padding tokens (`var(--section-pad-v)` and `var(--section-pad-h)`).
- Safe area insets (`env(safe-area-inset-top)`, etc.) and `100dvh` units are respected.
- Background consists of the fixed `#sheet-cv` living physics membrane, followed by the main DOM content layer ($z\text{-index}: 1$), overlaid by `#cv` for canvas ink, pen cursor, and creatures ($z\text{-index}: 5$).

---

## 3. Current Content of the Four Target Sections

### Section 1: "things i do" (`#sec-skills`)
- **Heading**: `things i do` (interactive physics letters)
- **Skills Paragraph**:
  ```text
  Python, TypeScript, React, Next.js, AI agents, LLM orchestration, local-first systems, full-stack engineering, open source.
  ```
- **Interactive Doodle Face**: Hand-drawn SVG doodle (`.face`) whose pupils (`#eye-l`, `#eye-r`) track the pen/pointer cursor in real time.
- **Caption**: `oh, you are an engineer? me too.` (physics letters)

### Section 2: "projects" (`#sec-projects`)
- **Heading**: `projects` (interactive physics letters)
- **Grid Container**: `<div class="project-grid" id="project-grid">`
- **Rendered Projects**:
  1. **MEMORA** (Python): *Open-source autonomous AI agent engine built from scratch. Six-layer architecture, provider-agnostic LLM interface.*
  2. **ghumo-ai** (TypeScript): *AI-powered travel planner with interactive maps, budget charts, and itinerary export.*
  3. **trackly** (TypeScript): *Privacy-first local habit and metric analytics suite with offline-first storage and rich chart dashboards.*
  4. **droidbridge** (Rust): *Universal Android-to-macOS file transfer over USB.*
  5. **portfolio** (CSS): *Minimal UI portfolio site with clean typography and intentional whitespace.*
  6. **college-practical-codes** (Jupyter Notebook): *Machine learning, DAA and AI practical code notebooks from coursework.*

### Section 3: "work and education" (`#sec-work`)
- **Heading**: `work` (interactive physics letters)
- **Sub-group: Experience**:
  - **Industrial Technical Visit**:
    - Organization: *Bhaskaracharya National Institute for Space Applications and Geo-informatics (BISAG-N) · Gandhinagar, Gujarat*
    - Detail: *Space Technology, Geographic Information Systems (GIS), Remote Sensing and Geospatial AI. Explored satellite data pipelines and machine learning models for spatial analysis.*
- **Sub-group: Education**:
  - **Marwadi University**: *B.Tech in Computer Science and Engineering, AI and ML · two thousand twenty four to two thousand twenty eight · CGPA eight point four two*
  - **Class twelve**: *UP Board, Science and Mathematics · eighty-eight percent*
  - **Class ten**: *UP Board · eighty-nine percent*
- **Sub-group: Certifications**:
  - *Oracle Cloud Infrastructure AI Foundations*
  - *Cisco CCNA Cloud Networking*
  - *IBM Artificial Intelligence Fundamentals*
  - *Problem Solving Using Computational Thinking, University of Michigan*
  - *Data Analyst and Generative AI Credentials, LinkedIn Learning*
  - *Digital Electronics and Hardware Foundations, NPTEL*

### Section 4: "say hello" (`#sec-hello`)
- **Heading**: `say hello` (interactive physics letters)
- **Body Copy**: *Write to me. Leave a blot on this page and I will find it.*
- **Links Row**:
  - Email: `mailto:mp498343@gmail.com` ("hey mail me")
  - GitHub: `https://github.com/mahendrapratap23` ("github")
  - LinkedIn: `https://www.linkedin.com/in/mahendra-pratap` ("linkedin")
  - Resume: `/resume.pdf` ("download resume" — `download="Mahendra_Pratap_Resume.pdf"`)

---

## 4. Why the Projects Section Rendered Empty on the Live Site

On the deployed live site ([`https://portfolio-v2-sand-kappa.vercel.app/`](https://portfolio-v2-sand-kappa.vercel.app/)):
1. **Empty Static HTML Payload**: The delivered HTML contained an empty `<div class="project-grid" id="project-grid"></div>`.
2. **Client-Side Dependency**: The original build injected cards via client-side JavaScript (`main.ts` querying `projects.json`). If the client script encountered a timing delay, network throttle, or blocking before execution, the section stayed blank.
3. **Current Mitigation**: Projects are now pre-rendered into the static HTML at build time via `index.html` and hydrated cleanly, eliminating blank renders and layout shift.

---

## 5. Build-Time GitHub Repository List (Max 6)

Fetched directly from GitHub REST API (`https://api.github.com/users/mahendrapratap23/repos`) via `scripts/fetch-projects.mjs` (wired into `prebuild` in `package.json`). Criteria: **non-forks, non-empty description, sorted by stars descending, then pushed date descending**:

| # | Repo Name | Primary Language | Stars | Pushed Date | GitHub Description | Source / Status |
|---|---|---|---|---|---|---|
| **1** | **portfolio01** | CSS | 1 | 2026-10-01 | *MINIMAL UI PORtFOLIO* | GitHub API |
| **2** | **MEMORA** | Python | 1 | 2026-09-02 | *MEMORA is an open-source personal AI assistant and autonomous agent engineered from scratch* | GitHub API & Resume Flagship |
| **3** | **college-practical-codes** | Jupyter Notebook | 0 | 2026-10-08 | *machine learning ,DAA ,AI codes practicals* | GitHub API |
| **4** | **droidbridge** | Rust | 0 | 2026-09-28 | *Universal Android-to-macOS file transfer over USB* | GitHub API |
| **5** | **trackly** | TypeScript | 0 | 2026-07-31 | *an idea that track anything what you want ,graph visuals* | GitHub API & Resume Flagship |
| **6** | **ghumo-ai** | TypeScript | 0 | 2026-07-18 | *travel tracker ,maps ,checklist,budgets,most everything for travel planning* | GitHub API & Resume Flagship |

*(Note: In `projects.json`, we can display either the exact GitHub description or the resume-aligned one-line summary. Let me know your preference when approving).*

---

## 6. Next Steps

Awaiting your approval of this repository list before proceeding to **Phase 1: Skills as a Living Ecosystem**.

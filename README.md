<div align="center">

# Portfolio — Mahendra Pratap

<p align="center">
  <strong>A handwritten, physics-driven notebook portfolio engineered with vanilla TypeScript and 60 Hz canvas physics.</strong>
</p>

<p align="center">
  <a href="https://portfolio-v2-sand-kappa.vercel.app/"><strong>Live Site ↗</strong></a> &nbsp;•&nbsp;
  <a href="https://github.com/mahendrapratap23"><strong>GitHub ↗</strong></a> &nbsp;•&nbsp;
  <a href="https://www.linkedin.com/in/mahendra-pratap"><strong>LinkedIn ↗</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Vitest-729B1B?style=flat-square&logo=vitest&logoColor=white" alt="Vitest" />
  <img src="https://img.shields.io/badge/Dependencies-Zero-2b3de0?style=flat-square" alt="Zero Dependencies" />
  <img src="https://img.shields.io/badge/FPS-60%20Fixed-1b2340?style=flat-square" alt="60 FPS" />
</p>

</div>

---

## Overview

A personal portfolio engineered as an interactive, white dot-grid notebook page. Every interaction is calculated using hand-written mathematics and physics with zero external runtime libraries:

- **Living Paper Membrane**: 2D wave heightfield background that elastically dents under cursor/touch, ripples outward on tap, and sleeps automatically for zero idle CPU.
- **Letter Spring Dynamics**: Individual DOM letter bodies that sway, disperse under cursor shockwaves, and react to gravity and device tilt.
- **Interactive Dot Portrait**: Luminance-sampled dot cloud that dynamically morphs between portrait silhouette, handwritten name, and photograph.
- **Skills Living Ecosystem**: Autonomous ink creatures wandering the page, reacting to pen speed, and forming spring-tension links.
- **Hanging Sketchbook Pages**: GitHub repository cards suspended by pushpins with natural pendulum swing physics and 3D flip inspection.
- **Self-Drawing Timeline**: Continuous wobbly ink stroke that draws itself downward in lockstep with viewport scrolling.
- **Paper Plane Contact**: Origami fold and curved aerodynamic flight animation delivering a handwritten note to email.

---

## Tech Stack

| Category | Tools & Technologies |
|---|---|
| **Core** | Vanilla TypeScript, Semantic HTML5, Vanilla CSS |
| **Build & Tooling** | Vite, Rollup, TypeScript Compiler (`tsc`) |
| **Testing** | Vitest (73 unit tests covering physics equations, gestures & lifecycles) |
| **Rendering** | HTML5 Canvas 2D, zero-allocation `Float32Array` buffers |
| **Typography** | Custom handwriting typeface (`Myfont-Tight`) with targeted `Caveat` fallback |
| **Hosting** | Vercel |

---

## Quickstart

```bash
# Clone the repository
git clone https://github.com/mahendrapratap23/portfolio-v2.git
cd portfolio-v2

# Install dependencies
npm install

# Start local development server
npm run dev

# Run unit tests
npm test

# Build for production
npm run build
```

---

<div align="center">
  <sub>Crafted with care by <a href="https://github.com/mahendrapratap23">Mahendra Pratap</a></sub>
</div>

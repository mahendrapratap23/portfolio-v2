# Portfolio — Mahendra Pratap

> A handwritten, physics-driven personal portfolio engineered as an exact evolution of the template design, physics, and interaction spec.

## Tech Stack

- **Scaffold**: Vite + Vanilla TypeScript + Plain CSS
- **Typography**: Custom handwriting typeface (`Myfont-Regular.ttf`) with targeted `Caveat` fallback via `unicode-range` for uncovered symbols
- **Physics Engine**: Hand-written fixed-timestep 60 Hz accumulator physics (zero runtime dependencies)
  - Letter spring dynamics (spring 0.05, damping 0.86)
  - Rotation spring dynamics (spring 0.05, damping 0.9)
  - Pen mass-on-a-spring follower (spring 0.2, damping 0.62)
  - Gravity toggle mode with floor collision and bounce
  - Canvas ink trail, drips, and ink blots
  - Wobbly autonomous blob creatures with eye orientation
  - Interactive pupil tracking on hand-drawn SVG face
  - Oulipo highlighter on touch/hover

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
Executes all 35 unit tests for physics constants, springs, gravity, floor collisions, pen motion, and repel dynamics via Vitest.

### Build for Production
```bash
npm run build
```

## Project Structure

```
├── .github/workflows/deploy.yml # CI/CD for GitHub Pages
├── public/
│   └── fonts/                   # Self-hosted handwriting & fallback fonts
├── src/
│   ├── data/
│   │   └── projects.json        # Build-time frozen top 6 GitHub repos
│   ├── physics/
│   │   ├── bootstrap.ts         # Fixed-timestep loop & engine wiring
│   │   ├── creatures.ts         # Wobbly blob creatures & behaviors
│   │   ├── ink.ts               # Canvas ink trail, bead, drips & blots
│   │   ├── letters.ts           # Letter DOM splitting & spring stepping
│   │   ├── physics.ts           # Pure physics constants & formulas
│   │   └── physics.test.ts      # Comprehensive Vitest unit test suite
│   ├── main.ts                  # App bootstrap, project cards, marker events
│   └── style.css                # CSS design system tokens, typography & dark theme
├── index.html                   # Semantic HTML with accessibility landmarks
├── vercel.json                  # Deployment configuration for Vercel
└── vite.config.ts               # Vite configuration
```

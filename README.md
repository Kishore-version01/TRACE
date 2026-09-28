# TRACE (Train Ripple & Anomaly Cascade Engine)

A simulation engine and visualization application for network delay propagation and cascading effects.

## Project Structure

```
delay-cascade/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts              # includes the vitest config
├── README.md
├── public/
└── src/
    ├── main.ts                 # hour 2: app entry, wires UI to engine
    ├── engine/                 # HOUR 1 (the engine)
    │   ├── types.ts
    │   ├── rng.ts
    │   ├── network.ts
    │   ├── propagate.ts
    │   ├── simulate.ts
    │   └── engine.test.ts
    ├── ui/                     # HOUR 2 (interactive UI)
    │   ├── render.ts           # draws nodes/edges on canvas or SVG
    │   ├── layout.ts           # fixed node coordinates for the sample network
    │   ├── animate.ts          # step-by-step spread animation, colour scale
    │   └── controls.ts         # click-to-inject, delay input, Run button
    ├── analysis/               # HOUR 3 (statistical analysis)
    │   ├── histogram.ts        # bins simulate().totals and draws the chart
    │   └── scenarios.ts        # presets: "junction failure", "single late rake"
    └── styles.css
```

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run unit tests
npm run test
```

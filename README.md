# TRACE (Train Ripple & Anomaly Cascade Engine)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-purple.svg)](https://vitejs.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-5.1-black.svg)](https://www.fastify.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.6-green.svg)](https://www.mongodb.com/)
[![Vitest](https://img.shields.io/badge/Vitest-1.4-yellow.svg)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**TRACE** is a rail transit delay cascade propagation engine, Monte Carlo bottleneck simulation platform, and topological transit visualization tool. It models how localized train delays ripple through complex rail networks, identifies systemic network vulnerabilities, and allows interactive experimentation with infrastructure parameters.

> **Disclaimer:** Prototype. Propagation probabilities and damping factors are illustrative models and not calibrated against actual transit agency operational data.

---

## Table of Contents

- [Key Features](#key-features)
- [Architecture & Mathematical Model](#architecture--mathematical-model)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation Guide](#installation-guide)
- [Running the Application](#running-the-application)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [REST API Reference](#rest-api-reference)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

---

## Key Features

1. **Deterministic Propagation Engine**:
   - Discrete-event cascade propagation powered by a seeded `mulberry32` PRNG.
   - Identical seeds yield strictly bit-identical propagation chains and delay distributions.
   - Non-linear delay attenuation with slack buffers and transmission damping.

2. **Interactive SVG Network Visualization**:
   - Custom SVG renderer with fixed topological layout for stations and junctions.
   - Step-by-step animated BFS wavefront with configurable speed (Normal: 400ms, Fast: 100ms).
   - Dynamic color-grading scale: Green (0m) $\to$ Lime (1–5m) $\to$ Amber (6–15m) $\to$ Red (16m+).
   - Interactive click-to-inject stations and click-to-select track edges.

3. **Monte Carlo Bottleneck Analysis**:
   - Runs 100 to 5,000 stochastic cascade simulations.
   - Computes distribution metrics: Mean, Median, 95th Percentile ($P_{95}$), Max Delay, and Containment Rate ($P(\text{no spread})$).
   - Spatial hit-rate heatmap rendering on nodes ($0\%$ dark neutral to $100\%$ glowing red).
   - Real-time SVG histogram distribution chart with mean and percentile indicators.

4. **Node Criticality Sweep**:
   - Evaluates cascade vulnerability by testing delays across every network node.
   - Ranks top 5 most vulnerable stations.
   - Visualizes systemic impact with scaled highlight rings on the network map.
   - Upsert caching in MongoDB (`analyses` collection) for instant repeated sweeps.

5. **Run Comparison View**:
   - Compare any two historical runs directly from the simulation history table.
   - Dual semi-transparent overlaid histogram sharing identical bin edges over a unified $[min, max]$ domain.
   - Comprehensive delta table displaying exact metric deltas ($b - a$).

6. **Custom Scenario Editor (Full CRUD)**:
   - Click any rail track on the network map or choose from the edge list.
   - Tune edge transmission probability ($p$), damping factor ($d$), and slack buffer ($s$).
   - Save custom scenarios to MongoDB (`scenarios` collection) with duplicate name validation (HTTP 409).
   - Select saved custom scenarios from the main preset dropdown to run simulations.

---

## Architecture & Mathematical Model

### Delay Transfer Formula

When a delay of $D_{\text{from}}$ minutes hits node $A$, delay transfer along directed edge $A \to B$ is computed as:

1. **Transmission Chance**: A random float $r \in [0, 1)$ is sampled from the seeded PRNG. If $r \ge p$, the delay is absorbed ($0$ minutes transmitted).
2. **Slack Buffer & Damping**:
   $$\Delta D = \max\left(0, (D_{\text{from}} - \text{slack}) \times \text{damping}\right)$$
3. **Arrival at Target**: The new delay at node $B$ is updated to $\max(D_{\text{existing}}, \Delta D)$.

### Determinism Guarantee

All random numbers pass through `mulberry32(seed)`. In Monte Carlo runs, iteration $i$ is deterministically initialized with $\text{seed} + i$. Node criticality sweeps seed each node with $\text{seed} + \text{nodeIndex} \times 100000$.

---

## Tech Stack

| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend** | Vite, Vanilla TypeScript, SVG | High-performance, zero UI framework overhead, pixel-crisp vector rendering |
| **Backend** | Fastify, TypeScript (`tsx`) | High-throughput, low latency, robust plugin lifecycle |
| **Database** | MongoDB Official Driver (`mongodb`) | Document store, compound indexing, no heavy ORM/Mongoose overhead |
| **Validation** | Zod (v4) | Strict runtime schema parsing and request sanitization |
| **Rate Limiter** | `@fastify/rate-limit` | Protects endpoints against denial-of-service (60 req/min/IP) |
| **Testing** | Vitest, `mongodb-memory-server` | Fast parallel tests, fully isolated in-memory DB (no external DB required for tests) |

---

## Prerequisites

Before running the application, make sure you have installed:

- **Node.js**: `v18.0.0` or higher (`v20+` recommended)
- **npm**: `v9.0.0` or higher
- **MongoDB**: Community Server running locally on port `27017` (or accessible via URI)

> **Note**: For running unit/integration tests (`npm run test`), a local MongoDB instance is **not** required; tests automatically spin up an isolated `mongodb-memory-server`.

---

## Installation Guide

### 1. Clone the Repository

```bash
git clone https://github.com/Kishore-version01/TRACE.git
cd TRACE
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create your local `.env` file from the provided `.env.example`:

```bash
cp .env.example .env
```

Default configuration in `.env`:

```env
MONGODB_URI=mongodb://127.0.0.1:27017
DB_NAME=trace
PORT=3001
```

*(Ensure MongoDB is running locally on port `27017`, or point `MONGODB_URI` to your MongoDB cluster).*

---

## Running the Application

### Method 1: Concurrent Dev (Recommended)

Starts both the Fastify backend server (port `3001`) and the Vite development server (port `5173`) concurrently:

```bash
npm run dev
```

Open your browser at:
```
http://localhost:5173
```

*(Requests to `/api/*` are automatically proxied by Vite to the backend on `http://127.0.0.1:3001`).*

---

### Method 2: Separate Terminals

If you prefer viewing backend API logs and frontend Vite logs in separate terminal windows:

#### Terminal 1 — Backend Server
```bash
npm run dev:server
```
*Output: `Backend API running on http://localhost:3001`*

#### Terminal 2 — Frontend Client
```bash
npx vite
```
*Output: `Local: http://localhost:5173/`*

---

### Method 3: Production Build

To verify compilation and create an optimized production bundle:

```bash
npm run build
```

To preview the built production bundle:

```bash
npm run preview
```

---

## Testing & Quality Assurance

TRACE includes a full test suite with 46 automated tests covering the engine, statistical distribution analysis, SVG rendering helpers, and end-to-end Fastify API routes.

### Run All Tests
```bash
npm run test
```

### Type Checking
Verify all TypeScript types without emitting files:
```bash
npx tsc --noEmit
```

### Test Suite Breakdown

- `src/engine/engine.test.ts`: Validates PRNG determinism, single-run cascade bounds, slack absorption, and Monte Carlo stats.
- `src/analysis/stats.test.ts`: Verifies mean, median, percentiles, binning algorithms, and shared two-dataset histogram binning.
- `src/analysis/scenarios.test.ts`: Tests scenario network modification functions and custom edge override applications.
- `src/ui/ui.test.ts`: Tests animation cancellation, step synchronization, and color interpolation functions.
- `server/server.test.ts`: Tests backend health, simulation CRUD, 400/404/409 validation, criticality sweeps with caching, and comparison deltas using `mongodb-memory-server`.

---

## REST API Reference

All API routes are prefixed with `/api`. Rate limited to 60 requests/min per IP.

### System & Scenarios
- `GET /api/health` — Checks service and MongoDB connectivity (`{ ok: true, db: "up" }`).
- `GET /api/network` — Returns base station and track topology (`SAMPLE_NETWORK`).
- `GET /api/scenarios` — Lists preset scenarios (Junction failure, Single late rake, etc.).

### Simulations
- `POST /api/simulations` — Executes and persists a Monte Carlo run.
  - Body: `{ nodeId: string, minutes: number (1-60), seed: number, runs: 100|500|2000|5000, scenarioId?: string, customScenarioId?: string }`
  - Returns: HTTP 201 with full document and summary metrics.
- `GET /api/simulations?limit=20` — Retrieves historical simulation summaries (newest first).
- `GET /api/simulations/:id` — Fetches full simulation run by ID, including per-run totals and node hit rates.
- `DELETE /api/simulations/:id` — Deletes a simulation run (HTTP 204).
- `GET /api/simulations/compare?a=<id>&b=<id>` — Returns both runs and computed deltas ($b - a$).

### Criticality Analysis
- `POST /api/analysis/criticality` — Performs network-wide vulnerability sweep.
  - Body: `{ minutes: number (1-60), seed: number, runs: 100|500, scenarioId?: string }`
  - Returns: `[{ nodeId, meanTotal, meanAffected, p95 }]` sorted by `meanTotal` descending, with `cached: boolean`.

### Custom Scenarios
- `GET /api/custom-scenarios` — Lists all saved custom scenarios.
- `POST /api/custom-scenarios` — Creates a custom scenario (HTTP 409 if name already exists).
  - Body: `{ name: string, description?: string, injection: { nodeId, minutes }, overrides: Array<{ from, to, p?, damping?, slack? }> }`
- `GET /api/custom-scenarios/:id` — Fetches custom scenario details.
- `PUT /api/custom-scenarios/:id` — Updates custom scenario by ID.
- `DELETE /api/custom-scenarios/:id` — Deletes custom scenario by ID.

---

## Project Structure

```
TRACE/
├── index.html                  # HTML entry point with layout shell
├── package.json                # Project dependencies, scripts, and metadata
├── tsconfig.json               # TypeScript compiler options
├── vite.config.ts              # Vite config, dev proxy, and Vitest settings
├── .env.example                # Sample environment configuration
├── .gitignore                  # Ignored files (node_modules, dist, .env, logs)
├── README.md                   # Comprehensive documentation
├── server/                     # Backend API (Fastify + MongoDB)
│   ├── config.ts               # Server environment configuration
│   ├── db.ts                   # MongoDB connection, models, indexes, and queries
│   ├── index.ts                # Fastify app initialization and server entry point
│   ├── routes.ts               # REST API route handlers
│   ├── server.test.ts          # Integration tests using mongodb-memory-server
│   └── validate.ts             # Zod schema validation and request sanitizers
└── src/                        # Frontend Application
    ├── main.ts                 # App entry point, DOM wiring, and API integration
    ├── styles.css              # Custom styling, dark theme, and grid layouts
    ├── engine/                 # Pure propagation engine (client- & server-shared)
    │   ├── engine.test.ts      # Engine unit tests
    │   ├── network.ts          # Sample 12-node rail transit network
    │   ├── propagate.ts        # BFS single-run cascade propagation with events
    │   ├── rng.ts              # Seeded mulberry32 PRNG
    │   ├── simulate.ts         # Monte Carlo multi-run runner
    │   └── types.ts            # Core TypeScript types (Node, Edge, Network)
    ├── analysis/               # Statistical analysis & charts
    │   ├── histogram.ts        # SVG histogram and dual-overlaid comparison chart
    │   ├── scenarios.ts        # Preset scenarios and pure applyOverrides() logic
    │   ├── scenarios.test.ts   # Scenario test suite
    │   ├── stats.ts            # Pure statistics functions (mean, median, percentile, bins)
    │   └── stats.test.ts       # Statistics test suite
    └── ui/                     # UI components & canvas renderers
        ├── animate.ts          # Event-driven step animation scheduler
        ├── api.ts              # Typed fetch client for backend endpoints
        ├── controls.ts         # Control panel UI, buttons, inputs, readouts
        ├── layout.ts           # Topological {x, y} coordinate mappings
        ├── render.ts           # SVG network renderer (nodes, edges, badges, heatmap, rings)
        └── ui.test.ts          # UI animation and color-scale unit tests
```

---

## Troubleshooting

### "Backend Offline" Banner
- **Cause**: The Vite frontend is running, but the Fastify backend server on port `3001` has not been started, or MongoDB is not running.
- **Fix**:
  1. Verify MongoDB is active: `mongod` or check your MongoDB service.
  2. Run `npm run dev` to start both frontend and backend together.
  3. The browser will automatically detect the backend and reconnect within 3 seconds.

### Port 5173 Already in Use
- **Cause**: A previous Vite process is still running in the background.
- **Fix**: Either stop the other process, or check your terminal output: Vite will automatically bind to the next available port (e.g., `http://localhost:5174/`).

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

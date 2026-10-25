# Qumni Lab — MIT Beer Distribution Game

A state-of-the-art implementation of the MIT Beer Distribution Game built according to the normative contracts in `ENGINE.md`, `API.md`, `SPEC.md`, and `schema.sql`.

## Monorepo Structure

```
BeerGame/
├── packages/
│   └── engine/             # Pure deterministic simulation (zero runtime dependencies)
│       ├── src/
│       │   ├── types.ts    # Canonical domain types & interfaces
│       │   ├── engine.ts   # 5-step simulation loop & PRNG demand
│       │   ├── bots.ts     # NaiveBot, BaseStockBot, StermanBot, ScriptedBot
│       │   ├── benchmark.ts# Shadow base-stock simulation
│       │   ├── metrics.ts  # Bullwhip ratio, amplification, fill rate
│       │   └── cli.ts      # Command line runner
│       └── test/
│           └── golden.test.ts # All 9 golden tests (G1–G9)
├── apps/
│   ├── server/             # Fastify 5 + WebSocket + Kysely
│   │   ├── src/
│   │   │   ├── db/         # Dual-dialect (PostgreSQL & node:sqlite) + schema
│   │   │   ├── repo/       # Fully typed Kysely repository layer
│   │   │   ├── services/   # RoomManager & TeamRoom state orchestration
│   │   │   ├── http/       # Zod schemas for HTTP/WS boundaries
│   │   │   └── server.ts   # REST endpoints & WebSocket protocol
│   │   └── test/
│   │       ├── server.test.ts        # Information isolation & idempotency
│   │       └── e2e-simulation.test.ts# Multi-week game loop & debrief results
│   └── web/                # React 19 + Vite + Tailwind + Recharts
│       ├── src/
│       │   ├── player/     # Mobile-first player UI & reflection modals
│       │   ├── host/       # Facilitator live cohort control grid
│       │   ├── debrief/    # Stepwise echelon reveal presentation
│       │   └── App.tsx     # Clean client routing (/j/<code>, /lab/play, /lab/host, /lab/r/:id)
```

## Running the Application

### 1. Build All Packages
```bash
pnpm build
```

### 2. Run All Tests
```bash
pnpm test:all
```
- **Engine Tests:** 9/9 Golden Tests passing (`G1`–`G9`).
- **Server Tests:** 4/4 Invariant & E2E tests passing.

### 3. Run Simulation CLI
```bash
pnpm sim -- --scenario scenarios/classic.json --bots base-stock,base-stock,base-stock,base-stock --out out/run.json --csv out/run.csv
```

### 4. Start Server & Production Web App
```bash
cd apps/server && node dist/index.js
```
The server will listen at `http://0.0.0.0:3001` and serve:
- REST API: `http://localhost:3001/lab/api/*`
- WebSocket: `ws://localhost:3001/lab/ws`
- Player join: `http://localhost:3001/j/<code>`
- Player screen: `http://localhost:3001/lab/play`
- Facilitator console: `http://localhost:3001/lab/host`
- Debrief presentation: `http://localhost:3001/lab/r/<runId>`

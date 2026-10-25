# Qumni Lab — build spec

A Learning Organization platform hosted as a subsite of **qumni.com**. Its first learning
experience is the MIT Beer Distribution Game. The game is the first module, not the
architecture.

This document is the build contract. `docs/ENGINE.md`, `docs/API.md` and `db/schema.sql`
are normative; where they disagree with this file, they win.

---

## 1. Scope of this build

Phases 0–2 only. Everything else is deliberately out of scope.

| Phase | Ships | Done when |
|---|---|---|
| 0 · Engine | Pure deterministic simulation, bot policies, scenario schema, CLI runner | All golden tests in `docs/ENGINE.md` §8 pass |
| 1 · Experience | Multiplayer game, persistence, facilitator console, prediction + reflection capture, debrief | A facilitator runs 5 teams end to end; kill the server mid-run and it resumes |
| 2 · Experiment | Run 1 vs Run 2, team predictions, prediction-vs-outcome analysis | A team predicts, runs the experiment, and sees where it was wrong |

**Out of scope:** AI coach, organizational memory browser, white-label theming, public
leaderboards, PDF export, localisation, concurrency beyond 150 players.

Build phase 0 completely and prove it against the golden tests before writing any UI.
Every later phase is worthless on a wrong engine.

---

## 2. Architecture

```
Browser (player)  ─┐
Browser (host)    ─┼─ HTTPS/WSS ─→ reverse proxy (qumni.com/lab) ─→ Node server
Browser (observer)─┘                                                   │
                                                                       ├─ @lab/engine (pure)
                                                                       └─ PostgreSQL
```

- The **server is the sole authority** on game state. The client renders what it is sent
  and computes nothing.
- The **engine is pure**: no I/O, no clock, no `Math.random`. It takes state plus orders
  and returns new state. This is what makes runs replayable and tests deterministic.
- **Every decision and every derived week state is written to Postgres synchronously,
  before the submission is acknowledged.** No in-memory-only runs, no batched flush at
  end of run. A session that crashes at week 30 and loses its data is worse than one that
  never ran.

### Stack

| Layer | Choice |
|---|---|
| Language | TypeScript, strict mode, everywhere |
| Runtime | Node 22 |
| Monorepo | pnpm workspaces |
| Server | Fastify 5 + `ws` |
| DB | PostgreSQL 16, Kysely (typed SQL, no ORM magic) |
| Migrations | Plain numbered `.sql` files, applied in order |
| Web | React 19 + Vite + TypeScript |
| Styling | Tailwind, inheriting qumni.com tokens |
| Charts | Recharts |
| Tests | Vitest (engine + server), Playwright (one happy-path e2e) |
| Validation | Zod at every boundary — HTTP body, WS message, scenario JSON |

No Redis, no message queue, no Kubernetes. At 150 players and one decision per player per
minute, peak write throughput is about 3 writes/second. Resist infrastructure.

### Repo layout

```
qumni-lab/
├── CLAUDE.md                  # rules for agents working in this repo
├── SPEC.md                    # this file
├── docs/
│   ├── ENGINE.md              # normative simulation contract
│   └── API.md                 # normative REST + WS contract
├── db/
│   ├── schema.sql             # full DDL, the source of truth
│   └── migrations/            # 0001_init.sql, 0002_....sql
├── scenarios/
│   └── classic.json           # Sterman 1989 defaults
├── packages/
│   └── engine/                # pure simulation, ZERO runtime dependencies
│       ├── src/{types,engine,bots,scenario,benchmark}.ts
│       └── test/{golden,invariants,bots}.test.ts
└── apps/
    ├── server/                # Fastify + ws + Kysely
    │   └── src/{http,ws,rooms,repo,services}/
    └── web/                   # React: player, host, debrief
        └── src/{player,host,debrief,shared}/
```

`packages/engine` must have **zero runtime dependencies** and must run unchanged in Node
and in a browser. The single-player practice mode later imports it directly.

---

## 3. Domain model

Two layers. Keep them separate in code as well as in the database.

**Game layer** (Beer Game specific):
`session → run → team → seat → decision → week_state`

**Platform layer** (experience-agnostic, lands in phase 2):
`organization → person → learning_experience → experiment → prediction → utterance → insight`

A `seat` is a position in a team. Its holder can change between human and bot mid-run
without the seat losing its history. This matters more than anything else in the model:
players disconnect constantly.

See `db/schema.sql` for the full DDL.

---

## 4. Session lifecycle

```
draft → lobby → running ⇄ paused → finished → (another run) → debrief
```

- A **session** owns one or more **runs**. Teams persist across runs of a session, so run 1
  and run 2 can be compared for the same people.
- **Rounds advance per team, not per session.** One slow team must never block thirty
  others. "The session is at week 14" is a summary statistic, not a state.
- Three advancement modes, chosen per run:
  1. `timer` — round closes after N seconds; unsubmitted seats get their bot's order.
     **Default.**
  2. `wait_all` — round closes when every seat has submitted. Offer it; never default to it.
  3. `async` — teams advance independently over hours or days.

---

## 5. Screens

### 5.1 Player (`/lab/play`, mobile first)

Shows, and shows nothing else:

- Current week. The end week is **not** shown unless the scenario says so.
- Inventory, backlog, and the shipping pipeline as visible boxes. Animate arrivals —
  this is where cheap implementations lose people.
- Incoming order from the downstream customer this week.
- One integer input and an explicit Confirm.
- Own history: table + sparkline of order, inventory, backlog, weekly cost, cumulative cost.
- Cost ticker.

**Never** any other echelon's numbers, unless `scenario.informationSharing` is true. Enforce
this in the serialiser, not the UI — anyone can open dev tools.

Input rules: integers only; negatives clamped to 0; values above
`scenario.orderWarnThreshold` (default 50) trigger a confirm dialog, not a rejection.
Double-tap protection via idempotency key (see `docs/API.md`).

### 5.2 Host (`/lab/host`)

A live grid of teams × weeks. Three things must be legible at a glance: which teams are
behind, which seats are bot-held, which players have not submitted this round.

Controls: pause/resume all · extend current timer · force-advance a team · substitute bot
for a seat · reassign a player · broadcast or message one team · stop the run early ·
start the next run.

### 5.3 Debrief (`/lab/r/<id>`)

A presentation mode driven by arrow keys, with a **reveal control** that unmasks echelons
progressively. Players are blind for the whole game; the debrief's value comes from lifting
that blindfold in a controlled order.

Slide order:
1. End-customer demand alone — it was nearly flat.
2. Four-panel order chart, one panel per echelon, **same y-axis on every panel**, demand
   overlaid. Different scales destroy the point.
3. Inventory and backlog over time, signed about zero.
4. Cumulative cost, with the base-stock benchmark line.
5. Supply-line reveal: each player's order against what was already in their pipeline.
6. Prediction vs outcome, per team (phase 2).
7. Leaderboard: total cost, cost split, bullwhip ratio.
8. Cross-run comparison (phase 2).

Players get their own read-only debrief link.

---

## 6. Reflection and prediction capture (phase 1–2)

Part of the player flow, not a separate survey. Short modal, 2–3 fields, skippable, stored
against the week it interrupted. **Fire immediately after a submission is acknowledged,
never before the order input.**

| Trigger | Prompt | Stored kind |
|---|---|---|
| Before run | What do you expect will happen to your inventory and orders? | `prediction` |
| Before experiment run | What will change if we share point-of-sale demand? | `prediction` |
| First backlog | What do you think caused this? | `belief` |
| First order ≥ 2× incoming demand | Why this quantity, and what do you expect next week? | `belief` |
| Weeks 1, 12, 24 | What is your current rule for deciding? | `mental_model` |
| After run | What surprised you? What would you do differently? Did your model change? | `reflection` |

Cap at 5 per run. Budget 30 seconds each. Log skip rate; cut any prompt skipped by more
than half of players.

---

## 7. Analysis

All metrics are computed from `week_state` and `decision`. Never store a derived aggregate
as the source of truth.

### Behaviour metrics

| Metric | Formula |
|---|---|
| Team total cost | Σ over echelons and weeks of `holdCost·inventory + backCost·backlog` |
| Cost split | holding vs backlog, per echelon |
| Bullwhip ratio | `Var(orders placed by echelon) / Var(end-customer demand)` |
| Stage amplification | `Var(orders out) / Var(orders in)` at each echelon |
| Inventory variance ratio | `Var(inventory) / Var(demand)` |
| Peak-to-trough | `max(inventory) − min(inventory)` per echelon |
| Amplification factor | peak factory order / peak end-customer demand |
| Service level | weeks with zero backlog / total weeks |
| Fill rate | `Σ shipped / Σ (incomingOrder + openingBacklog)` |
| Order latency | median `decision.latency_ms` per week |
| Gap to optimum | team cost / benchmark cost |

**Benchmark:** at run creation, the server runs a shadow simulation of the same scenario
with four base-stock bots and stores the result. It is the reference line on every chart
and it converts a subjective debrief into an objective one. Cost: one engine call.

### Learning metrics (phase 2)

| Metric | How |
|---|---|
| Prediction accuracy | stored prediction vs realised series |
| Direction error | sign of predicted change vs sign of actual change |
| Belief–outcome divergence | weeks where a stated belief contradicted the system response |
| Mental-model drift | diff of a person's stated decision rule at weeks 1, 12, 24 |
| Experiment result | predicted effect vs measured effect on cost and bullwhip ratio |

### Export

CSV (one row per team-echelon-week, every `week_state` column) and XLSX (same plus a
summary sheet). No PDF in this build.

---

## 8. Hosting on qumni.com

Subpath, not subdomain. One origin: one session cookie, one analytics property, no CORS,
and the subsite inherits the domain's standing.

| Path | Serves |
|---|---|
| `/lab` | Catalogue of learning experiences |
| `/lab/beer-game` | Experience page |
| `/j/<code>` | Player join — short, typable, read aloud, QR-friendly |
| `/lab/host` | Facilitator console, authenticated |
| `/lab/r/<id>` | Published debrief, read-only, shareable |

Own deployable behind a reverse proxy. Own database. Split identity: facilitators
authenticate against a qumni account; **players stay anonymous** — display name plus token,
never touching the account system. Anonymity is not a gap to close later; it keeps the
product out of institutional data-protection review.

Inherit qumni.com's design tokens, typography and PWA shell.

---

## 9. Non-functional

| Area | Target |
|---|---|
| Concurrency | 150 players / 40 teams; pilot scale is 40–80 players |
| Latency | order acknowledged < 300 ms at p95 |
| Durability | survive a server restart mid-run with zero state loss |
| Devices | phone first; players will use phones whatever you intend |
| Network | WebSocket with SSE/long-poll fallback — conference wifi blocks things |
| Accessibility | WCAG 2.1 AA |
| Browsers | last two versions of Chrome, Safari, Firefox, Edge |

---

## 10. Build order

1. `packages/engine` — types, scenario schema, `advanceWeek`, bots, CLI runner.
2. Golden tests. **Stop here until they pass.**
3. `db/schema.sql` + migrations + repo layer.
4. Server: sessions, join, seats, WS loop, round advancement, persistence, reconnection.
5. Player UI, then host console.
6. Debrief + metrics + export.
7. Prediction and reflection capture.
8. Second run, experiment framing, cross-run comparison.

### Definition of done, per slice

- Types at every boundary, validated with Zod.
- Unit tests for logic, one integration test per endpoint or WS message.
- No state lives only in memory.
- Manual check on a phone-sized viewport.

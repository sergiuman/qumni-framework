# Engine contract — normative

`packages/engine`. Zero runtime dependencies. Pure functions only: no I/O, no `Date.now()`,
no `Math.random()`. Randomness comes from a seeded PRNG passed in with the scenario.

Implementations of the Beer Game diverge on execution order, and the divergence is invisible
until the costs come out wrong. North and Macal built the same game three times and got
three answers. This file pins the order down. Follow it literally.

---

## 1. Types

```ts
export const RETAILER = 0;

export interface Scenario {
  id: string;
  name: string;
  echelons: number;              // 4 in the classic game; 3–6 supported
  weeks: number;                 // 36 classic, 20 short
  revealEndWeek: boolean;        // default false — players must not know when it ends

  initialInventory: number;      // 12
  initialBacklog: number;        // 0
  initialPipelineUnits: number;  // 4 — every shipping/order/WIP slot starts at this
  initialIncomingOrder: number;  // 4

  orderDelay: number;            // 1 — mailing delay; order pipeline length = orderDelay + 1
  shippingDelay: number;         // 2 — shipping pipeline length
  productionLeadTime: number;    // 2 — factory WIP pipeline length

  holdCostCents: number;         // 50
  backCostCents: number;         // 100
  perEchelonCosts?: { holdCostCents: number; backCostCents: number }[];

  demand: DemandSpec;
  factoryCapacity: number | null;   // null = unlimited
  minOrderQty: number;              // 1 = no MOQ; orders round UP to a multiple
  lostSales: boolean;               // false = backlog carries forward (classic)
  informationSharing: boolean;      // true = every seat sees end-customer demand
  showSupplyLine: boolean;          // true = pipeline visible to the player
  orderWarnThreshold: number;       // 50 — confirm dialog above this, never a rejection
  maxOrder: number;                 // 9999 — hard clamp
}

export type DemandSpec =
  | { kind: 'step'; before: number; after: number; changeWeek: number }   // 4 → 8 at week 5
  | { kind: 'constant'; value: number }
  | { kind: 'ramp'; from: number; to: number; overWeeks: number }
  | { kind: 'seasonal'; base: number; amplitude: number; period: number }
  | { kind: 'random'; min: number; max: number; seed: number }
  | { kind: 'scripted'; series: number[] };                               // 1-indexed by week

export interface EchelonState {
  inventory: number;
  backlog: number;
  incomingOrder: number;    // what this echelon must fill THIS week
  shipping: number[];       // length = shippingDelay; [0] = farthest, [last] = arrives next step 1
  orderPipe: number[];      // length = orderDelay + 1; [0] = just placed, [last] = next to arrive
  wip: number[];            // factory only; length = productionLeadTime
  cumCostCents: number;
}

export interface TeamState {
  week: number;             // 0 before the first advance
  echelons: EchelonState[]; // index 0 = retailer, index n-1 = factory
  rngState: number;
}

export interface WeekRecord {
  week: number;
  echelon: number;
  inventory: number;
  backlog: number;
  incomingOrder: number;
  shipped: number;
  orderPlaced: number;
  pipeline: number[];
  weekCostCents: number;
  cumCostCents: number;
}

export function initTeam(s: Scenario): TeamState;
export function advanceWeek(
  s: Scenario, state: TeamState, orders: number[]
): { state: TeamState; records: WeekRecord[] };
export function demandAt(s: Scenario, week: number, rngState: number): { value: number; rngState: number };
```

`advanceWeek` must not mutate its arguments. Return new objects.

---

## 2. Initialisation

For every echelon:

```
inventory      = initialInventory              // 12
backlog        = initialBacklog                // 0
incomingOrder  = initialIncomingOrder          // 4
shipping       = [4, 4]                        // length shippingDelay,      all initialPipelineUnits
orderPipe      = [4, 4]                        // length orderDelay + 1,     all initialPipelineUnits
wip            = [4, 4]                        // factory only, length productionLeadTime
cumCostCents   = 0
week           = 0
```

Pipeline index convention, used everywhere: **index 0 is farthest from arrival, the last
index arrives next.**

---

## 3. The five steps

Execute in this exact order, all echelons completing a step before the next step begins.

### Step 1 — Receive

For each echelon:

```
inventory += (isFactory ? wip[last] : shipping[last])
shift the array right: for i = last down to 1: a[i] = a[i-1]; a[0] = 0
```

Inventory received in step 1 **is available to ship in step 2 of the same week.**

### Step 2 — Fill orders

Downstream first, retailer → factory.

```
retailer.incomingOrder = demandAt(week)              // external demand replaces the read
for e from RETAILER upstream to FACTORY:
    required = e.incomingOrder + e.backlog
    shipped  = min(e.inventory, required)
    e.inventory -= shipped
    e.backlog    = lostSales ? 0 : required - shipped
    if e is RETAILER: nothing to deliver into (the customer takes it)
    else:             customerOf(e).shipping[0] = shipped
```

Note: the retailer's `incomingOrder` comes from the demand series, not from a pipeline.
Every other echelon reads `incomingOrder` set at step 4 of the previous week.

The factory's supplier is itself: it never backlogs against an upstream party.

### Step 3 — Record cost

```
weekCost  = holdCostCents * inventory + backCostCents * backlog
cumCost  += weekCost
```

Inventory and backlog cannot both be positive, so an echelon is charged one or the other,
never both. Costs accrue on the **end-of-step-2** values.

### Step 4 — Advance order slips

For each echelon except the factory:

```
supplier.incomingOrder = supplier.orderPipe[last]
shift supplier.orderPipe right by one, orderPipe[0] = 0
```

Equivalently and more simply, since each echelon owns its own outgoing pipe: shift every
non-factory echelon's `orderPipe`, and set the supplier's `incomingOrder` from the value
that falls off the end.

### Step 5 — Place orders

```
for each echelon e:
    q = clamp(round(orders[e]), 0, maxOrder)
    if minOrderQty > 1: q = ceil(q / minOrderQty) * minOrderQty
    if e is FACTORY:
        if factoryCapacity != null: q = min(q, factoryCapacity)
        e.wip[0] = q
    else:
        e.orderPipe[0] = q
week += 1
```

### Resulting lags

| Action at week *t* | Visible at |
|---|---|
| Order placed by R/W/D | supplier's `incomingOrder` at week *t+2* (with `orderDelay = 1`) |
| Shipment made | customer's inventory at week *t+2* (with `shippingDelay = 2`) |
| Production started | factory inventory at week *t+2* |
| Full acquisition lag, R/W/D | 4 weeks |
| Full acquisition lag, factory | 3 weeks (2 with the corrected supply-line accounting below) |

---

## 4. Supply line

Any bot that reasons about what is already on order uses:

```
supplyLine(e) = sum(e.orderPipe) + sum(e.shipping) + supplier.backlog   // R/W/D
supplyLine(F) = sum(F.wip)                                             // factory
```

**Use acquisition lags of 3 weeks for R/W/D and 2 for the factory when computing a desired
supply line**, not 4 and 3. Sterman's prose implies 4 and 3; Edali & Yasarcan showed that
orders placed at step 5 of week *t* are effectively for week *t+1*, and that using 4 and 3
introduces a permanent steady-state error. This is the single most commonly copied bug in
Beer Game implementations.

---

## 5. Bot policies

```ts
export interface Bot {
  decide(ctx: BotContext): number;
}
export interface BotContext {
  scenario: Scenario;
  echelon: number;
  self: EchelonState;
  supplierBacklog: number;
  history: { incomingOrder: number; inventory: number; backlog: number }[];
  memory: Record<string, number>;   // bot-owned scratch, persisted with the seat
}
```

### `naive`
`order = clamp(incomingOrder, 0, maxOrder)`. Explainable to students in one sentence. Not
the default — a naive bot in a human team is conspicuously different and distorts comparison.

### `base-stock` (the benchmark)
```
position = inventory - backlog + supplyLine
order    = max(0, round(S - position))
```
`S` per echelon, default `[28, 28, 28, 20]` for R/W/D/F in the classic scenario. Sterman's
optimal parameters are θ = 0, sat = 1, β = 1, which reduce to exactly this.

### `sterman` (the default for filling empty seats)
```
expected     = expected + θ * (incomingOrder - expected)        // expected₀ = initialIncomingOrder
effectiveInv = inventory - backlog
order = max(0, round(
    expected
  + (desiredInventory - effectiveInv) / sat
  + β * (desiredSupplyLine - supplyLine) / sat
))
```
Defaults: `θ = 0.3`, `sat = 2`, `β = 0.3`, `desiredInventory = 12`,
`desiredSupplyLine = expected * acquisitionLag`. This behaves like a typical human: it
discounts most of what is already on order, which is exactly why the bullwhip appears.

Rounding: **half away from zero**. Fix this now; a tie-breaking difference silently changes
the cost series.

### `scripted`
Replays a fixed series. For reproducible demos and tests.

---

## 6. Demand

`demandAt` is pure: for `random`, it takes and returns the PRNG state. Use a 32-bit
xorshift or mulberry32 written out in the package — no dependency.

```ts
function mulberry32(a: number): { value: number; state: number }
```

The seed lives on the run row. Replaying a run reproduces its demand exactly.

---

## 7. CLI runner

```
pnpm --filter @lab/engine run sim \
  --scenario scenarios/classic.json \
  --bots base-stock,base-stock,base-stock,base-stock \
  --out out/run.json --csv out/run.csv
```

Prints per-echelon and team total cost. Used by the golden tests and by the scenario
editor's preview.

---

## 8. Golden tests — the gate for phase 0

No UI work begins until all of these pass.

### G1 · Steady state (hand-verifiable)
Constant demand 4. Every echelon orders exactly 4 every week, 36 weeks.
**Expect:** every echelon holds inventory 12 and backlog 0 in every week; weekly cost
600 cents per echelon; team weekly cost 2400 cents; **team total 86,400 cents ($864.00)**.
If this fails, step 1 and step 2 are in the wrong order.

### G2 · Order lag
`orderDelay = 1`. Retailer orders 9 at week 1, 4 thereafter.
**Expect:** the wholesaler's `incomingOrder` equals 9 at week 3, and only week 3.

### G3 · Shipping lag
`shippingDelay = 2`. A shipment made in step 2 of week *t* appears in the customer's
inventory in step 1 of week *t+2*, not *t+1* or *t+3*.

### G4 · Zero delay
`orderDelay = 0`, `shippingDelay = 1`. An order placed at week *t* is seen by the supplier
at *t+1*; a shipment arrives at *t+1*. No off-by-one, no empty-array crash.

### G5 · Backlog conservation
Any scenario, any bots, 36 weeks. For each echelon:
`Σ shipped + endingBacklog == Σ incomingOrder + openingBacklog`. Exact integers.

### G6 · No simultaneous inventory and backlog
For every echelon and week: `inventory > 0 && backlog > 0` is never true.

### G7 · Benchmark snapshot
Classic scenario, four `base-stock` bots at S = [28, 28, 28, 20], 36 weeks.
Compute once, commit the full week-by-week cost series as a golden JSON file, and assert
byte equality thereafter. Team total should land in the low hundreds of dollars — an order
of magnitude under the ~$2,000 a typical human team produces. Do **not** hardcode a target
number before computing it; hardcode the series you computed and treat any later change to
it as a regression requiring an explicit note in the PR.

### G8 · Replay determinism
Store a run's order series, re-run it through a fresh engine, assert identical
`WeekRecord[]`. Repeat with `demand.kind = 'random'` and a fixed seed.

### G9 · Purity
`advanceWeek` does not mutate its inputs: deep-freeze the input state in the test and
assert no throw.

---

## 9. Versioning

`engineVersion` is a constant in the package and is stamped on every run row. When the
engine changes in a way that alters output, bump it. Old runs either replay under the old
version or are marked non-replayable — never silently re-scored under new rules.

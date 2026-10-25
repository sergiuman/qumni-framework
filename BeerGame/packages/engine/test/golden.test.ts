import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  Scenario,
  TeamState,
  initTeam,
  advanceWeek,
  runBenchmark,
  createBot,
  StermanBot
} from '../src/index.js';

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const val = (obj as any)[key];
    if (val !== null && typeof val === 'object') {
      deepFreeze(val);
    }
  }
  return obj;
}

const baseClassicScenario: Scenario = {
  id: 'classic',
  name: 'Classic — Sterman 1989',
  echelons: 4,
  weeks: 36,
  revealEndWeek: false,
  initialInventory: 12,
  initialBacklog: 0,
  initialPipelineUnits: 4,
  initialIncomingOrder: 4,
  orderDelay: 1,
  shippingDelay: 2,
  productionLeadTime: 2,
  holdCostCents: 50,
  backCostCents: 100,
  demand: { kind: 'step', before: 4, after: 8, changeWeek: 5 },
  factoryCapacity: null,
  minOrderQty: 1,
  lostSales: false,
  informationSharing: false,
  showSupplyLine: true,
  orderWarnThreshold: 50,
  maxOrder: 9999
};

describe('Golden Tests (ENGINE.md §8)', () => {
  // ── G1 · Steady state (hand-verifiable) ──
  it('G1 · Steady state: constant demand 4, orders 4 -> exactly $864.00 total', () => {
    const scenario: Scenario = {
      ...baseClassicScenario,
      demand: { kind: 'constant', value: 4 }
    };

    let state = initTeam(scenario);
    let totalTeamCost = 0;

    for (let w = 1; w <= 36; w++) {
      const orders = [4, 4, 4, 4];
      const { state: nextState, records } = advanceWeek(scenario, state, orders);
      state = nextState;

      for (let e = 0; e < 4; e++) {
        expect(records[e].inventory).toBe(12);
        expect(records[e].backlog).toBe(0);
        expect(records[e].weekCostCents).toBe(600);
      }
      totalTeamCost += records.reduce((sum, r) => sum + r.weekCostCents, 0);
    }

    expect(totalTeamCost).toBe(86400); // exactly 86,400 cents ($864.00)
    for (let e = 0; e < 4; e++) {
      expect(state.echelons[e].cumCostCents).toBe(21600);
    }
  });

  // ── G2 · Order lag ──
  it('G2 · Order lag: orderDelay = 1, retailer orders 9 at week 1 -> wholesaler sees 9 at week 3 only', () => {
    const scenario: Scenario = {
      ...baseClassicScenario,
      demand: { kind: 'constant', value: 4 }
    };

    let state = initTeam(scenario);
    const wholesalerIncomingOrders: number[] = [];

    for (let w = 1; w <= 6; w++) {
      const retailerOrder = w === 1 ? 9 : 4;
      const orders = [retailerOrder, 4, 4, 4];
      const { state: nextState, records } = advanceWeek(scenario, state, orders);
      state = nextState;
      wholesalerIncomingOrders.push(records[1].incomingOrder);
    }

    // Wholesaler incomingOrder should be 4 at week 1, 4 at week 2, 9 at week 3, and 4 at weeks 4-6
    expect(wholesalerIncomingOrders[0]).toBe(4);
    expect(wholesalerIncomingOrders[1]).toBe(4);
    expect(wholesalerIncomingOrders[2]).toBe(9); // week 3
    expect(wholesalerIncomingOrders[3]).toBe(4);
    expect(wholesalerIncomingOrders[4]).toBe(4);
    expect(wholesalerIncomingOrders[5]).toBe(4);
  });

  // ── G3 · Shipping lag ──
  it('G3 · Shipping lag: shipment made at week t appears in inventory at week t+2', () => {
    const scenario: Scenario = {
      ...baseClassicScenario,
      demand: { kind: 'constant', value: 4 }
    };

    let state = initTeam(scenario);

    // Initial shipping pipeline for retailer is [4, 4]
    // At week 1 step 2, wholesaler will ship 4.
    // Let's force an order shift: wholesaler has lots of inventory, ships a specific amount
    // Let's trace retailer inventory across weeks:
    // Week 1: initial pipeline [4, 4]. Step 1 receives 4. Inventory becomes 12+4=16. Demand 4 -> ships 4 -> inventory 12.
    // Wholesaler ships 10 to retailer in week 1 step 2.
    // We expect the 10 shipped in week 1 step 2 to arrive at week 3 step 1!
    state.echelons[1].incomingOrder = 10; // wholesaler asked to ship 10

    const { state: w1State, records: w1Records } = advanceWeek(scenario, state, [4, 4, 4, 4]);
    expect(w1Records[1].shipped).toBe(10); // wholesaler shipped 10 to retailer

    // In week 2, retailer receives shipping[1] from the pipeline (which was 4), NOT the 10
    const { state: w2State, records: w2Records } = advanceWeek(scenario, w1State, [4, 4, 4, 4]);
    // Retailer inventory in w2 end is 12 (received 4, sold 4)
    expect(w2Records[0].inventory).toBe(12);

    // In week 3, the 10 arrives in Step 1! Retailer inventory becomes 12 + 10 = 22, sells 4 -> 18!
    const { records: w3Records } = advanceWeek(scenario, w2State, [4, 4, 4, 4]);
    expect(w3Records[0].inventory).toBe(18); // 12 + 10 - 4 = 18
  });

  // ── G4 · Zero delay ──
  it('G4 · Zero delay: orderDelay = 0, shippingDelay = 1 -> order seen at t+1, shipment arrives at t+1', () => {
    const scenario: Scenario = {
      ...baseClassicScenario,
      orderDelay: 0,
      shippingDelay: 1,
      productionLeadTime: 1,
      initialPipelineUnits: 4,
      demand: { kind: 'constant', value: 4 }
    };

    let state = initTeam(scenario);
    expect(state.echelons[0].shipping.length).toBe(1);
    expect(state.echelons[0].orderPipe.length).toBe(0);

    // Week 1: Retailer orders 15
    const { state: w1State } = advanceWeek(scenario, state, [15, 4, 4, 4]);

    // Week 2: Wholesaler receives order slip at Step 5 of W1, processes incomingOrder = 15 in Step 2!
    const { state: w2State, records: w2Records } = advanceWeek(scenario, w1State, [4, 4, 4, 4]);
    expect(w2Records[1].incomingOrder).toBe(15);
    expect(w2Records[1].shipped).toBe(15);

    // Week 3: Shipment of 15 arrives in retailer's inventory in Step 1 (shippingDelay = 1)!
    // Retailer inventory in w2 was 12. In w3 receives 15 in step 1 -> 27. Demand 4 -> 23.
    const { records: w3Records } = advanceWeek(scenario, w2State, [4, 4, 4, 4]);
    expect(w3Records[0].inventory).toBe(23);
  });

  // ── G5 · Backlog conservation ──
  it('G5 · Backlog conservation: sum(shipped) + endingBacklog == sum(incomingOrder) + openingBacklog', () => {
    const scenario = baseClassicScenario;
    let state = initTeam(scenario);
    const sumShipped = [0, 0, 0, 0];
    const sumIncoming = [0, 0, 0, 0];
    const openingBacklog = state.echelons.map(e => e.backlog);

    const stermanBots = Array.from({ length: 4 }, () => new StermanBot());
    const histories = Array.from({ length: 4 }, () => [] as any[]);
    const memories = Array.from({ length: 4 }, () => ({}));

    for (let w = 1; w <= 36; w++) {
      const orders = state.echelons.map((ech, idx) =>
        stermanBots[idx].decide({
          scenario,
          echelon: idx,
          self: ech,
          supplierBacklog: state.echelons[idx + 1]?.backlog ?? 0,
          history: histories[idx],
          memory: memories[idx]
        })
      );

      const { state: nextState, records } = advanceWeek(scenario, state, orders);
      state = nextState;

      for (let e = 0; e < 4; e++) {
        sumShipped[e] += records[e].shipped;
        sumIncoming[e] += records[e].incomingOrder;
        histories[e].push(records[e]);
      }
    }

    for (let e = 0; e < 4; e++) {
      const endingBacklog = state.echelons[e].backlog;
      expect(sumShipped[e] + endingBacklog).toBe(sumIncoming[e] + openingBacklog[e]);
    }
  });

  // ── G6 · No simultaneous inventory and backlog ──
  it('G6 · No simultaneous inventory and backlog: never inventory > 0 && backlog > 0', () => {
    const scenario = baseClassicScenario;
    let state = initTeam(scenario);
    const stermanBots = Array.from({ length: 4 }, () => new StermanBot());
    const histories = Array.from({ length: 4 }, () => [] as any[]);
    const memories = Array.from({ length: 4 }, () => ({}));

    for (let w = 1; w <= 36; w++) {
      const orders = state.echelons.map((ech, idx) =>
        stermanBots[idx].decide({
          scenario,
          echelon: idx,
          self: ech,
          supplierBacklog: state.echelons[idx + 1]?.backlog ?? 0,
          history: histories[idx],
          memory: memories[idx]
        })
      );

      const { state: nextState, records } = advanceWeek(scenario, state, orders);
      state = nextState;

      for (let e = 0; e < 4; e++) {
        expect(records[e].inventory > 0 && records[e].backlog > 0).toBe(false);
        expect(state.echelons[e].inventory > 0 && state.echelons[e].backlog > 0).toBe(false);
      }
    }
  });

  // ── G7 · Benchmark snapshot ──
  it('G7 · Benchmark snapshot: base-stock benchmark computes deterministically and matches snapshot', () => {
    const bench = runBenchmark(baseClassicScenario, [28, 28, 28, 20]);
    expect(bench.teamTotalCents).toBe(123800);
    expect(bench.perEchelonTotalCents).toEqual([12200, 20600, 44600, 46400]);

    const snapshotPath = path.resolve(__dirname, 'golden_benchmark.json');
    if (!fs.existsSync(snapshotPath)) {
      // First run: save the benchmark snapshot
      fs.writeFileSync(
        snapshotPath,
        JSON.stringify(
          {
            teamTotalCents: bench.teamTotalCents,
            perEchelonTotalCents: bench.perEchelonTotalCents,
            series: bench.series
          },
          null,
          2
        )
      );
    }

    const saved = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    expect(bench.teamTotalCents).toBe(saved.teamTotalCents);
    expect(bench.perEchelonTotalCents).toEqual(saved.perEchelonTotalCents);
  });

  // ── G8 · Replay determinism ──
  it('G8 · Replay determinism: identical orders produce bit-for-bit identical records', () => {
    const scenario: Scenario = {
      ...baseClassicScenario,
      demand: { kind: 'random', min: 2, max: 12, seed: 987654321 }
    };

    // Run 1: with sterman bots
    let s1 = initTeam(scenario);
    const recordedOrders: number[][] = [];
    const run1Records = [];
    const stermanBots = Array.from({ length: 4 }, () => new StermanBot());
    const histories = Array.from({ length: 4 }, () => [] as any[]);
    const memories = Array.from({ length: 4 }, () => ({}));

    for (let w = 1; w <= 36; w++) {
      const orders = s1.echelons.map((ech, idx) =>
        stermanBots[idx].decide({
          scenario,
          echelon: idx,
          self: ech,
          supplierBacklog: s1.echelons[idx + 1]?.backlog ?? 0,
          history: histories[idx],
          memory: memories[idx]
        })
      );
      recordedOrders.push(orders);
      const { state: nextS1, records } = advanceWeek(scenario, s1, orders);
      s1 = nextS1;
      run1Records.push(records);
    }

    // Run 2: Replay recordedOrders from fresh engine
    let s2 = initTeam(scenario);
    const run2Records = [];
    for (let w = 1; w <= 36; w++) {
      const { state: nextS2, records } = advanceWeek(scenario, s2, recordedOrders[w - 1]);
      s2 = nextS2;
      run2Records.push(records);
    }

    expect(run1Records).toEqual(run2Records);
    expect(s1).toEqual(s2);
  });

  // ── G9 · Purity ──
  it('G9 · Purity: advanceWeek does not mutate its inputs (deepFreeze)', () => {
    const scenario = deepFreeze({ ...baseClassicScenario });
    const state = deepFreeze(initTeam(scenario));
    const orders = deepFreeze([4, 4, 4, 4]);

    expect(() => {
      advanceWeek(scenario, state, orders as number[]);
    }).not.toThrow();
  });
});

import { Scenario, WeekRecord, TeamState } from './types.js';
import { initTeam, advanceToDecision, commitOrders } from './engine.js';
import { BaseStockBot } from './bots.js';

export interface BenchmarkResult {
  policy: 'base-stock';
  teamTotalCents: number;
  perEchelonTotalCents: number[];
  series: WeekRecord[][]; // index by week [weekIndex][echelon]
}

/**
 * Runs the deterministic shadow base-stock simulation for a given scenario.
 * Bots place orders at Step 5 of each week based on the state after arrivals and shipments.
 */
export function runBenchmark(
  scenario: Scenario,
  customS: number[] = [28, 28, 28, 20]
): BenchmarkResult {
  const bots = Array.from({ length: scenario.echelons }, () => new BaseStockBot(customS));
  let state: TeamState = initTeam(scenario);
  const series: WeekRecord[][] = [];
  const histories: { incomingOrder: number; inventory: number; backlog: number }[][] = Array.from(
    { length: scenario.echelons },
    () => []
  );
  const memories: Record<string, number>[] = Array.from(
    { length: scenario.echelons },
    () => ({})
  );

  for (let w = 1; w <= scenario.weeks; w++) {
    // Steps 1 to 4 advance: inventory received, demand filled, costs accrued, order slips advanced
    const prep = advanceToDecision(scenario, state);

    // Bots place orders at Step 5
    const orders: number[] = [];
    for (let e = 0; e < scenario.echelons; e++) {
      const supplierBacklog = prep.echelons[e + 1]?.backlog ?? 0;
      const order = bots[e].decide({
        scenario,
        echelon: e,
        self: prep.echelons[e],
        supplierBacklog,
        history: histories[e],
        memory: memories[e]
      });
      orders.push(order);
    }

    // Step 5 commit orders
    const { state: nextState, records } = commitOrders(scenario, prep, orders);
    state = nextState;
    series.push(records);

    for (let e = 0; e < scenario.echelons; e++) {
      histories[e].push({
        incomingOrder: records[e].incomingOrder,
        inventory: records[e].inventory,
        backlog: records[e].backlog
      });
    }
  }

  const perEchelonTotalCents = state.echelons.map(ech => ech.cumCostCents);
  const teamTotalCents = perEchelonTotalCents.reduce((a, b) => a + b, 0);

  return {
    policy: 'base-stock',
    teamTotalCents,
    perEchelonTotalCents,
    series
  };
}

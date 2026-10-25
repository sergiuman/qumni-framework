import {
  Scenario,
  TeamState,
  EchelonState,
  WeekRecord,
  RETAILER
} from './types.js';
import { mulberry32, roundHalfAwayFromZero } from './prng.js';

/**
 * Pure evaluation of customer demand for a given week.
 * Week is 1-indexed (week 1 is the first week played).
 */
export function demandAt(
  s: Scenario,
  week: number,
  rngState: number
): { value: number; rngState: number } {
  const d = s.demand;
  switch (d.kind) {
    case 'step': {
      const value = week < d.changeWeek ? d.before : d.after;
      return { value, rngState };
    }
    case 'constant': {
      return { value: d.value, rngState };
    }
    case 'ramp': {
      if (week <= 1) {
        return { value: d.from, rngState };
      }
      const progress = Math.min(1, (week - 1) / d.overWeeks);
      const val = roundHalfAwayFromZero(d.from + (d.to - d.from) * progress);
      return { value: val, rngState };
    }
    case 'seasonal': {
      const angle = (2 * Math.PI * (week - 1)) / d.period;
      const val = roundHalfAwayFromZero(d.base + d.amplitude * Math.sin(angle));
      return { value: Math.max(0, val), rngState };
    }
    case 'scripted': {
      const val = d.series[week - 1] ?? s.initialIncomingOrder;
      return { value: val, rngState };
    }
    case 'random': {
      const prng = mulberry32(rngState);
      const span = d.max - d.min + 1;
      const val = Math.floor(prng.value * span) + d.min;
      return { value: val, rngState: prng.state };
    }
  }
}

/**
 * Initialise fresh team state for a given scenario.
 * Week starts at 0 before any round advances.
 */
export function initTeam(s: Scenario, rngSeed?: number): TeamState {
  const echelons: EchelonState[] = [];
  const seed = rngSeed ?? (s.demand.kind === 'random' ? s.demand.seed : 123456789);

  for (let e = 0; e < s.echelons; e++) {
    const isFactory = e === s.echelons - 1;
    echelons.push({
      inventory: s.initialInventory,
      backlog: s.initialBacklog,
      incomingOrder: s.initialIncomingOrder,
      shipping: Array(s.shippingDelay).fill(s.initialPipelineUnits),
      orderPipe: Array(s.orderDelay).fill(s.initialPipelineUnits),
      wip: isFactory ? Array(s.productionLeadTime).fill(s.initialPipelineUnits) : [],
      cumCostCents: 0
    });
  }

  return {
    week: 0,
    echelons,
    rngState: seed
  };
}

/**
 * Compute the supply line for an echelon.
 * Section 4:
 * supplyLine(e) = sum(orderPipe) + sum(shipping) + supplier.backlog (for R/W/D)
 * supplyLine(F) = sum(F.wip) (for factory)
 */
export function getSupplyLine(echelons: readonly EchelonState[], echelonIndex: number): number {
  const isFactory = echelonIndex === echelons.length - 1;
  const self = echelons[echelonIndex];
  if (isFactory) {
    return self.wip.reduce((a, b) => a + b, 0);
  }
  const sumOrders = self.orderPipe.reduce((a, b) => a + b, 0);
  const sumShipping = self.shipping.reduce((a, b) => a + b, 0);
  const supplierBacklog = echelons[echelonIndex + 1]?.backlog ?? 0;
  return sumOrders + sumShipping + supplierBacklog;
}

export interface PreparedRound {
  targetWeek: number;
  rngState: number;
  echelons: EchelonState[];
  shippedRecord: number[];
  incomingOrderRecorded: number[];
  weekCosts: number[];
}

/**
 * Executes Steps 1 to 4 of the simulation.
 * This represents the state of the world when players / bots are asked to decide their orders.
 */
export function advanceToDecision(s: Scenario, state: TeamState): PreparedRound {
  const targetWeek = state.week + 1;
  let rngState = state.rngState;

  // Deep-clone echelons
  const echelons: EchelonState[] = state.echelons.map(ech => ({
    inventory: ech.inventory,
    backlog: ech.backlog,
    incomingOrder: ech.incomingOrder,
    shipping: [...ech.shipping],
    orderPipe: [...ech.orderPipe],
    wip: [...ech.wip],
    cumCostCents: ech.cumCostCents
  }));

  const shippedRecord: number[] = Array(s.echelons).fill(0);
  const incomingOrderRecorded: number[] = Array(s.echelons).fill(0);
  const weekCosts: number[] = Array(s.echelons).fill(0);

  // ── Step 1 — Receive ──
  for (let e = 0; e < s.echelons; e++) {
    const isFactory = e === s.echelons - 1;
    const ech = echelons[e];
    if (isFactory) {
      const arrived = ech.wip.length > 0 ? ech.wip[ech.wip.length - 1] : 0;
      ech.inventory += arrived;
      for (let i = ech.wip.length - 1; i >= 1; i--) {
        ech.wip[i] = ech.wip[i - 1];
      }
      if (ech.wip.length > 0) {
        ech.wip[0] = 0;
      }
    } else {
      const arrived = ech.shipping.length > 0 ? ech.shipping[ech.shipping.length - 1] : 0;
      ech.inventory += arrived;
      for (let i = ech.shipping.length - 1; i >= 1; i--) {
        ech.shipping[i] = ech.shipping[i - 1];
      }
      if (ech.shipping.length > 0) {
        ech.shipping[0] = 0;
      }
    }
  }

  // ── Step 2 — Fill orders ──
  // Downstream first: Retailer (0) -> Factory (n-1)
  const demandRes = demandAt(s, targetWeek, rngState);
  rngState = demandRes.rngState;
  echelons[RETAILER].incomingOrder = demandRes.value;

  for (let e = RETAILER; e < s.echelons; e++) {
    const ech = echelons[e];
    incomingOrderRecorded[e] = ech.incomingOrder;
    const required = ech.incomingOrder + ech.backlog;
    const shipped = Math.min(ech.inventory, required);
    ech.inventory -= shipped;
    ech.backlog = s.lostSales ? 0 : required - shipped;
    shippedRecord[e] = shipped;

    if (e === RETAILER) {
      // customer takes it
    } else {
      // Deliver to customerOf(e) which is e - 1
      echelons[e - 1].shipping[0] = shipped;
    }
  }

  // ── Step 3 — Record cost ──
  for (let e = 0; e < s.echelons; e++) {
    const ech = echelons[e];
    const holdCost = s.perEchelonCosts?.[e]?.holdCostCents ?? s.holdCostCents;
    const backCost = s.perEchelonCosts?.[e]?.backCostCents ?? s.backCostCents;
    const weekCost = holdCost * ech.inventory + backCost * ech.backlog;
    ech.cumCostCents += weekCost;
    weekCosts[e] = weekCost;
  }

  // ── Step 4 — Advance order slips ──
  // For each echelon except factory
  for (let e = 0; e < s.echelons - 1; e++) {
    const ech = echelons[e];
    const supplier = echelons[e + 1];
    if (ech.orderPipe.length > 0) {
      supplier.incomingOrder = ech.orderPipe[ech.orderPipe.length - 1];
      for (let i = ech.orderPipe.length - 1; i >= 1; i--) {
        ech.orderPipe[i] = ech.orderPipe[i - 1];
      }
      ech.orderPipe[0] = 0;
    }
  }

  return {
    targetWeek,
    rngState,
    echelons,
    shippedRecord,
    incomingOrderRecorded,
    weekCosts
  };
}

/**
 * Commits orders (Step 5) to the prepared round and creates WeekRecords.
 */
export function commitOrders(
  s: Scenario,
  prep: PreparedRound,
  orders: number[]
): { state: TeamState; records: WeekRecord[] } {
  const echelons = prep.echelons;
  const placedOrders: number[] = Array(s.echelons).fill(0);

  // ── Step 5 — Place orders ──
  for (let e = 0; e < s.echelons; e++) {
    const ech = echelons[e];
    const isFactory = e === s.echelons - 1;
    let q = roundHalfAwayFromZero(orders[e] ?? 0);
    q = Math.max(0, Math.min(q, s.maxOrder));
    if (s.minOrderQty > 1) {
      q = Math.ceil(q / s.minOrderQty) * s.minOrderQty;
    }

    if (isFactory) {
      if (s.factoryCapacity !== null) {
        q = Math.min(q, s.factoryCapacity);
      }
      if (ech.wip.length > 0) {
        ech.wip[0] = q;
      }
    } else {
      if (ech.orderPipe.length > 0) {
        ech.orderPipe[0] = q;
      } else {
        // Zero delay: order slip arrives immediately at supplier
        echelons[e + 1].incomingOrder = q;
      }
    }
    placedOrders[e] = q;
  }

  // Build records
  const records: WeekRecord[] = [];
  for (let e = 0; e < s.echelons; e++) {
    const ech = echelons[e];
    const isFactory = e === s.echelons - 1;
    records.push({
      week: prep.targetWeek,
      echelon: e,
      inventory: ech.inventory,
      backlog: ech.backlog,
      incomingOrder: prep.incomingOrderRecorded[e],
      shipped: prep.shippedRecord[e],
      orderPlaced: placedOrders[e],
      pipeline: isFactory ? [...ech.wip] : [...ech.shipping],
      weekCostCents: prep.weekCosts[e],
      cumCostCents: ech.cumCostCents
    });
  }

  return {
    state: {
      week: prep.targetWeek,
      echelons,
      rngState: prep.rngState
    },
    records
  };
}

/**
 * Advance the simulation by one week (Steps 1 through 5).
 * Pure function: does NOT mutate arguments.
 */
export function advanceWeek(
  s: Scenario,
  state: TeamState,
  orders: number[]
): { state: TeamState; records: WeekRecord[] } {
  const prep = advanceToDecision(s, state);
  return commitOrders(s, prep, orders);
}

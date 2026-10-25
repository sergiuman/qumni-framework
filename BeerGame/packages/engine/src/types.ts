export const ENGINE_VERSION = '1.0.0';
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

export interface BotContext {
  scenario: Scenario;
  echelon: number;
  self: EchelonState;
  supplierBacklog: number;
  history: { incomingOrder: number; inventory: number; backlog: number }[];
  memory: Record<string, number>;
}

export interface Bot {
  decide(ctx: BotContext): number;
}

export type BotPolicyName = 'naive' | 'base-stock' | 'sterman' | 'scripted';

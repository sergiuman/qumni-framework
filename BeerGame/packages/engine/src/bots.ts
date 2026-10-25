import { Bot, BotContext, BotPolicyName } from './types.js';
import { roundHalfAwayFromZero } from './prng.js';

export function getSupplyLineFromCtx(ctx: BotContext): number {
  const isFactory = ctx.echelon === ctx.scenario.echelons - 1;
  if (isFactory) {
    return ctx.self.wip.reduce((a, b) => a + b, 0);
  }
  const sumOrders = ctx.self.orderPipe.reduce((a, b) => a + b, 0);
  const sumShipping = ctx.self.shipping.reduce((a, b) => a + b, 0);
  return sumOrders + sumShipping + ctx.supplierBacklog;
}

/**
 * Naive bot: orders exactly what came in.
 */
export const NaiveBot: Bot = {
  decide(ctx: BotContext): number {
    const maxOrder = ctx.scenario.maxOrder ?? 9999;
    return Math.max(0, Math.min(ctx.self.incomingOrder, maxOrder));
  }
};

/**
 * Base-stock bot (optimal benchmark).
 * position = inventory - backlog + supplyLine
 * order = max(0, round(S - position))
 */
export class BaseStockBot implements Bot {
  private readonly defaultS: number[];

  constructor(customS?: number[]) {
    this.defaultS = customS ?? [28, 28, 28, 20];
  }

  decide(ctx: BotContext): number {
    const sTarget = ctx.memory['S'] ?? this.defaultS[ctx.echelon] ?? 28;
    const supplyLine = getSupplyLineFromCtx(ctx);
    const position = ctx.self.inventory - ctx.self.backlog + supplyLine;
    const order = Math.max(0, roundHalfAwayFromZero(sTarget - position));
    const maxOrder = ctx.scenario.maxOrder ?? 9999;
    return Math.min(order, maxOrder);
  }
}

/**
 * Sterman bot (simulates typical human decision-making with under-weighting of supply line).
 * theta = 0.3, sat = 2, beta = 0.3, desiredInventory = 12
 */
export class StermanBot implements Bot {
  decide(ctx: BotContext): number {
    let expected = ctx.memory['expected'] ?? ctx.scenario.initialIncomingOrder;
    const theta = ctx.memory['theta'] ?? 0.3;
    const sat = ctx.memory['sat'] ?? 2;
    const beta = ctx.memory['beta'] ?? 0.3;
    const desiredInventory = ctx.memory['desiredInventory'] ?? 12;

    expected = expected + theta * (ctx.self.incomingOrder - expected);
    ctx.memory['expected'] = expected;

    const isFactory = ctx.echelon === ctx.scenario.echelons - 1;
    // Acquisition lags: 3 for R/W/D, 2 for factory (ENGINE.md §4)
    const acquisitionLag = isFactory ? 2 : 3;
    const desiredSupplyLine = expected * acquisitionLag;
    const effectiveInv = ctx.self.inventory - ctx.self.backlog;
    const supplyLine = getSupplyLineFromCtx(ctx);

    const raw = expected
      + (desiredInventory - effectiveInv) / sat
      + beta * (desiredSupplyLine - supplyLine) / sat;

    const order = Math.max(0, roundHalfAwayFromZero(raw));
    return Math.min(order, ctx.scenario.maxOrder);
  }
}

/**
 * Scripted bot: replays a fixed sequence of numbers.
 */
export class ScriptedBot implements Bot {
  private readonly series: number[];

  constructor(series: number[] = []) {
    this.series = series;
  }

  decide(ctx: BotContext): number {
    const weekIndex = ctx.history.length;
    const order = this.series[weekIndex] ?? ctx.self.incomingOrder;
    return Math.max(0, Math.min(order, ctx.scenario.maxOrder));
  }
}

/**
 * Create a Bot instance by policy name.
 */
export function createBot(
  policy: BotPolicyName,
  params?: Record<string, number>,
  series?: number[]
): Bot {
  switch (policy) {
    case 'naive':
      return NaiveBot;
    case 'base-stock':
      return new BaseStockBot(
        params?.['S'] !== undefined ? [params['S']] : undefined
      );
    case 'sterman':
      return new StermanBot();
    case 'scripted':
      return new ScriptedBot(series ?? []);
  }
}

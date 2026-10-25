import { WeekRecord } from './types.js';

export interface EchelonMetrics {
  echelon: number;
  totalCents: number;
  holdCents: number;
  backCents: number;
  bullwhipRatio: number;
  stageAmplification: number;
  inventoryVarianceRatio: number;
  peakToTrough: number;
  serviceLevel: number;
  fillRate: number;
}

export interface TeamMetrics {
  totalCents: number;
  byEchelon: EchelonMetrics[];
  amplificationFactor: number;
  gapToOptimum?: number;
}

/**
 * Population variance calculation.
 */
export function variance(series: number[]): number {
  if (series.length <= 1) return 0;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const sumSquares = series.reduce((sum, val) => sum + (val - mean) ** 2, 0);
  return sumSquares / series.length;
}

/**
 * Computes behaviour metrics for a team's week records.
 * @param recordsByWeek Array indexed by week [weekIndex][echelonIndex]
 * @param demandSeries End customer demand values for each week
 * @param holdCostCents Holding cost in cents
 * @param backCostCents Backlog cost in cents
 * @param benchmarkTotalCents Optional benchmark total for gap to optimum
 */
export function computeTeamMetrics(
  recordsByWeek: WeekRecord[][],
  demandSeries: number[],
  holdCostCents: number = 50,
  backCostCents: number = 100,
  benchmarkTotalCents?: number
): TeamMetrics {
  if (recordsByWeek.length === 0) {
    return {
      totalCents: 0,
      byEchelon: [],
      amplificationFactor: 1.0
    };
  }

  const numWeeks = recordsByWeek.length;
  const numEchelons = recordsByWeek[0].length;
  const demandVar = variance(demandSeries);

  const byEchelon: EchelonMetrics[] = [];
  let teamTotalCents = 0;

  for (let e = 0; e < numEchelons; e++) {
    const ordersPlaced: number[] = [];
    const ordersIn: number[] = [];
    const inventories: number[] = [];
    let holdCents = 0;
    let backCents = 0;
    let totalCents = 0;
    let zeroBacklogWeeks = 0;
    let sumShipped = 0;
    let sumDemandRequired = 0;

    let prevBacklog = 0;
    for (let w = 0; w < numWeeks; w++) {
      const rec = recordsByWeek[w][e];
      ordersPlaced.push(rec.orderPlaced);
      ordersIn.push(rec.incomingOrder);
      inventories.push(rec.inventory);

      const h = rec.inventory * holdCostCents;
      const b = rec.backlog * backCostCents;
      holdCents += h;
      backCents += b;
      totalCents += rec.weekCostCents;

      if (rec.backlog === 0) {
        zeroBacklogWeeks++;
      }

      sumShipped += rec.shipped;
      sumDemandRequired += rec.incomingOrder + prevBacklog;
      prevBacklog = rec.backlog;
    }

    teamTotalCents += totalCents;

    const ordersVar = variance(ordersPlaced);
    const inVar = variance(ordersIn);
    const invVar = variance(inventories);

    const bullwhipRatio = demandVar > 0 ? ordersVar / demandVar : 1.0;
    const stageAmplification = inVar > 0 ? ordersVar / inVar : 1.0;
    const inventoryVarianceRatio = demandVar > 0 ? invVar / demandVar : 0.0;
    const peakToTrough = inventories.length > 0
      ? Math.max(...inventories) - Math.min(...inventories)
      : 0;
    const serviceLevel = numWeeks > 0 ? zeroBacklogWeeks / numWeeks : 1.0;
    const fillRate = sumDemandRequired > 0 ? sumShipped / sumDemandRequired : 1.0;

    byEchelon.push({
      echelon: e,
      totalCents,
      holdCents,
      backCents,
      bullwhipRatio,
      stageAmplification,
      inventoryVarianceRatio,
      peakToTrough,
      serviceLevel,
      fillRate
    });
  }

  // Factory orders peak vs customer demand peak
  const factoryOrders = recordsByWeek.map(w => w[numEchelons - 1]?.orderPlaced ?? 0);
  const peakFactoryOrder = factoryOrders.length > 0 ? Math.max(...factoryOrders) : 0;
  const peakDemand = demandSeries.length > 0 ? Math.max(...demandSeries) : 1;
  const amplificationFactor = peakDemand > 0 ? peakFactoryOrder / peakDemand : 1.0;

  const gapToOptimum = benchmarkTotalCents && benchmarkTotalCents > 0
    ? teamTotalCents / benchmarkTotalCents
    : undefined;

  return {
    totalCents: teamTotalCents,
    byEchelon,
    amplificationFactor,
    gapToOptimum
  };
}

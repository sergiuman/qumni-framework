#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { Scenario, TeamState } from './types.js';
import { initTeam, advanceWeek, demandAt } from './engine.js';
import { createBot } from './bots.js';
import { computeTeamMetrics } from './metrics.js';

interface CliArgs {
  scenarioPath: string;
  botPolicies: string[];
  outJson?: string;
  outCsv?: string;
}

function parseArgs(args: string[]): CliArgs {
  let scenarioPath = 'scenarios/classic.json';
  let botPolicies = ['base-stock', 'base-stock', 'base-stock', 'base-stock'];
  let outJson: string | undefined;
  let outCsv: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--scenario' && args[i + 1]) {
      scenarioPath = args[++i];
    } else if (args[i] === '--bots' && args[i + 1]) {
      botPolicies = args[++i].split(',');
    } else if (args[i] === '--out' && args[i + 1]) {
      outJson = args[++i];
    } else if (args[i] === '--csv' && args[i + 1]) {
      outCsv = args[++i];
    }
  }

  return { scenarioPath, botPolicies, outJson, outCsv };
}

function runCli(): void {
  const parsed = parseArgs(process.argv.slice(2));
  let fullPath = path.resolve(process.cwd(), parsed.scenarioPath);
  if (!fs.existsSync(fullPath)) {
    const upOne = path.resolve(process.cwd(), '..', parsed.scenarioPath);
    const upTwo = path.resolve(process.cwd(), '../..', parsed.scenarioPath);
    if (fs.existsSync(upOne)) {
      fullPath = upOne;
    } else if (fs.existsSync(upTwo)) {
      fullPath = upTwo;
    } else {
      console.error(`Scenario file not found: ${fullPath}`);
      process.exit(1);
    }
  }

  const scenarioRaw = fs.readFileSync(fullPath, 'utf-8');
  const scenario: Scenario = JSON.parse(scenarioRaw);

  const bots = parsed.botPolicies.map(p => createBot(p as any));
  let state: TeamState = initTeam(scenario);
  const histories = Array.from({ length: scenario.echelons }, () => [] as any[]);
  const memories = Array.from({ length: scenario.echelons }, () => ({}));
  const recordsByWeek = [];
  const demandSeries: number[] = [];

  let dummyRng = state.rngState;
  for (let w = 1; w <= scenario.weeks; w++) {
    const dem = demandAt(scenario, w, dummyRng);
    dummyRng = dem.rngState;
    demandSeries.push(dem.value);

    const orders: number[] = [];
    for (let e = 0; e < scenario.echelons; e++) {
      const supplierBacklog = state.echelons[e + 1]?.backlog ?? 0;
      const order = bots[e].decide({
        scenario,
        echelon: e,
        self: state.echelons[e],
        supplierBacklog,
        history: histories[e],
        memory: memories[e]
      });
      orders.push(order);
    }

    const { state: nextState, records } = advanceWeek(scenario, state, orders);
    state = nextState;
    recordsByWeek.push(records);

    for (let e = 0; e < scenario.echelons; e++) {
      histories[e].push({
        incomingOrder: records[e].incomingOrder,
        inventory: records[e].inventory,
        backlog: records[e].backlog
      });
    }
  }

  const metrics = computeTeamMetrics(recordsByWeek, demandSeries, scenario.holdCostCents, scenario.backCostCents);

  console.log(`\n── Beer Distribution Game Simulation ──`);
  console.log(`Scenario: ${scenario.name} (${scenario.weeks} weeks)`);
  console.log(`Bots:     ${parsed.botPolicies.join(', ')}`);
  console.log(`Total Team Cost: $${(metrics.totalCents / 100).toFixed(2)} (${metrics.totalCents} cents)`);
  console.log(`Amplification Factor: ${metrics.amplificationFactor.toFixed(2)}x\n`);

  console.log(`Echelon Breakdown:`);
  const names = ['Retailer', 'Wholesaler', 'Distributor', 'Factory'];
  metrics.byEchelon.forEach((m, idx) => {
    console.log(
      `  [${idx}] ${names[idx] || `Echelon ${idx}`}: Cost $${(m.totalCents / 100).toFixed(2)} | Holding: $${(m.holdCents / 100).toFixed(2)} | Backlog: $${(m.backCents / 100).toFixed(2)} | Bullwhip: ${m.bullwhipRatio.toFixed(2)}`
    );
  });
  console.log();

  if (parsed.outJson) {
    const outDir = path.dirname(path.resolve(process.cwd(), parsed.outJson));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(parsed.outJson, JSON.stringify({ scenario, metrics, recordsByWeek }, null, 2));
    console.log(`Wrote JSON output to: ${parsed.outJson}`);
  }

  if (parsed.outCsv) {
    const outDir = path.dirname(path.resolve(process.cwd(), parsed.outCsv));
    fs.mkdirSync(outDir, { recursive: true });
    let csv = 'week,echelon,inventory,backlog,incoming_order,shipped,order_placed,week_cost_cents,cum_cost_cents\n';
    for (const weekRecs of recordsByWeek) {
      for (const r of weekRecs) {
        csv += `${r.week},${r.echelon},${r.inventory},${r.backlog},${r.incomingOrder},${r.shipped},${r.orderPlaced},${r.weekCostCents},${r.cumCostCents}\n`;
      }
    }
    fs.writeFileSync(parsed.outCsv, csv);
    console.log(`Wrote CSV output to: ${parsed.outCsv}`);
  }
}

runCli();

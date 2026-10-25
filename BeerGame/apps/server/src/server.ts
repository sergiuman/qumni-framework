import fastify, { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import crypto from 'crypto';
import { Kysely } from 'kysely';
import { WebSocket } from 'ws';

import {
  Scenario,
  ENGINE_VERSION,
  runBenchmark,
  computeTeamMetrics,
  demandAt
} from '@lab/engine';

import { Database } from './db/schema.js';
import { getDb, initDatabase } from './db/client.js';
import { Repository } from './repo/index.js';
import { RoomManager } from './services/manager.js';
import {
  CreateSessionSchema,
  PatchSessionSchema,
  CreateTeamsSchema,
  CreateRunSchema,
  SubstituteBotSchema,
  AssignSeatSchema,
  JoinSchema,
  RejoinSchema,
  SubmitOrderSchema,
  SubmitUtteranceSchema,
  SubmitPredictionSchema
} from './http/schemas.js';

import fastifyStatic from '@fastify/static';
import * as path from 'path';
import * as fs from 'fs';

export function createJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function buildServer(options: { db?: Kysely<Database> } = {}): Promise<FastifyInstance> {
  const app = fastify({ logger: false });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);
  await app.register(websocket);

  const webDistPath = path.resolve(process.cwd(), '../web/dist');
  const altWebDistPath = path.resolve(process.cwd(), 'apps/web/dist');
  const staticPath = fs.existsSync(webDistPath) ? webDistPath : (fs.existsSync(altWebDistPath) ? altWebDistPath : null);

  if (staticPath) {
    await app.register(fastifyStatic, {
      root: staticPath,
      prefix: '/',
      wildcard: false
    });

    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/lab/api') || req.url.startsWith('/lab/ws')) {
        return reply.status(404).send({ error: { code: 'not_found', message: 'Route not found' } });
      }
      return reply.sendFile('index.html');
    });
  }

  const db = options.db || getDb();
  await initDatabase(db);
  const repo = new Repository(db);
  const roomManager = new RoomManager(db, repo);

  // Seed default facilitator and classic scenario if not present
  const defaultUser = await db.selectFrom('app_user').selectAll().where('id', '=', '00000000-0000-0000-0000-000000000001').executeTakeFirst();
  if (!defaultUser) {
    await db.insertInto('app_user').values({
      id: '00000000-0000-0000-0000-000000000001',
      org_id: null,
      email: 'facilitator@qumni.com',
      name: 'Facilitator',
      role: 'facilitator',
      created_at: new Date().toISOString()
    }).execute();
  }

  const defaultScenario = await db.selectFrom('scenario').selectAll().where('name', '=', 'Classic — Sterman 1989').executeTakeFirst();
  if (!defaultScenario) {
    const classicParams: Scenario = {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Classic — Sterman 1989',
      weeks: 36,
      echelons: 4,
      revealEndWeek: false,
      initialInventory: 12,
      initialBacklog: 0,
      initialIncomingOrder: 4,
      initialPipelineUnits: 4,
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
    await db.insertInto('scenario').values({
      id: '00000000-0000-0000-0000-000000000002',
      owner_id: '00000000-0000-0000-0000-000000000001',
      org_id: null,
      name: 'Classic — Sterman 1989',
      is_template: 1,
      params: JSON.stringify(classicParams),
      params_version: 1,
      engine_version: ENGINE_VERSION,
      created_at: new Date().toISOString()
    }).execute();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ── 1. REST API (/lab/api)
  // ═══════════════════════════════════════════════════════════════════════

  // ── Facilitator Endpoints ──

  app.post('/lab/api/sessions', async (req, reply) => {
    const body = CreateSessionSchema.parse(req.body);
    const joinCode = createJoinCode();
    const session = await repo.createSession({
      facilitatorId: '00000000-0000-0000-0000-000000000001',
      title: body.title,
      joinCode,
      status: 'lobby'
    });
    return session;
  });

  app.get('/lab/api/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await repo.getSessionById(id);
    if (!session) return reply.status(404).send({ error: { code: 'not_found', message: 'Session not found' } });

    const runs = await repo.getRunsForSession(id);
    const activeRun = runs.find(r => r.status === 'running' || r.status === 'paused') || runs[0];
    const teams = activeRun ? await repo.getTeamsForRun(activeRun.id) : [];

    const teamsWithSeats = [];
    for (const t of teams) {
      const seats = await repo.getSeatsForTeam(t.id);
      teamsWithSeats.push({ ...t, seats });
    }

    return { session, runs, teams: teamsWithSeats };
  });

  app.patch('/lab/api/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = PatchSessionSchema.parse(req.body);
    await repo.updateSessionStatus(id, body.status);
    return { ok: true };
  });

  app.post('/lab/api/sessions/:id/teams', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = CreateTeamsSchema.parse(req.body || {});
    const runs = await repo.getRunsForSession(id);
    const run = runs.find(r => r.status === 'pending' || r.status === 'running') || runs[0];
    if (!run) return reply.status(400).send({ error: { code: 'no_run', message: 'Create a run first' } });

    const createdTeams = [];
    for (let i = 0; i < body.teamCount; i++) {
      const teamName = body.names?.[i] || `Team ${i + 1}`;
      const team = await repo.createTeam(id, run.id, teamName);
      // Create 4 echelons per team
      for (let e = 0; e < body.teamSize; e++) {
        await repo.createSeat({
          teamId: team.id,
          echelon: e,
          holderType: 'bot', // starts as bot until a human joins
          botPolicy: 'base-stock'
        });
      }
      createdTeams.push(team);
    }
    return { teams: createdTeams };
  });

  app.post('/lab/api/sessions/:id/runs', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = CreateRunSchema.parse(req.body || {});
    const existingRuns = await repo.getRunsForSession(id);
    const idx = existingRuns.length + 1;

    const scenarioId = body.scenarioId || '00000000-0000-0000-0000-000000000002';
    const scenarioRow = await db.selectFrom('scenario').selectAll().where('id', '=', scenarioId).executeTakeFirst();
    const scenario: Scenario = scenarioRow ? JSON.parse(scenarioRow.params) : {
      name: 'Classic',
      weeks: 36,
      echelons: 4,
      initialInventory: 12,
      initialBacklog: 0,
      initialIncomingOrder: 4,
      initialPipelineUnits: 4,
      orderDelay: 1,
      shippingDelay: 2,
      productionLeadTime: 2,
      holdCostCents: 50,
      backCostCents: 100,
      demand: { kind: 'step', initialValue: 4, stepWeek: 5, stepValue: 8 },
      informationSharing: false,
      lostSales: false
    };

    // Run shadow base-stock simulation benchmark (§7)
    const benchmark = runBenchmark(scenario, [28, 28, 28, 20]);

    const run = await repo.createRun({
      sessionId: id,
      scenarioId,
      idx,
      label: body.label || `Run ${idx}`,
      advancement: body.advancement,
      roundSeconds: body.roundSeconds,
      weeksPlanned: scenario.weeks,
      rngSeed: 12345,
      engineVersion: ENGINE_VERSION,
      benchmark
    });

    return run;
  });

  app.post('/lab/api/runs/:id/start', async (req, reply) => {
    const { id } = req.params as { id: string };
    await roomManager.startRun(id);
    return { ok: true };
  });

  app.post('/lab/api/runs/:id/stop', async (req, reply) => {
    const { id } = req.params as { id: string };
    await roomManager.stopRun(id);
    return { ok: true };
  });

  app.post('/lab/api/runs/:id/pause', async (req, reply) => {
    const { id } = req.params as { id: string };
    await roomManager.pauseRun(id);
    return { ok: true };
  });

  app.post('/lab/api/runs/:id/resume', async (req, reply) => {
    const { id } = req.params as { id: string };
    await roomManager.resumeRun(id);
    return { ok: true };
  });

  app.post('/lab/api/teams/:id/advance', async (req, reply) => {
    const { id } = req.params as { id: string };
    await roomManager.forceAdvanceTeam(id);
    return { ok: true };
  });

  app.post('/lab/api/seats/:id/bot', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = SubstituteBotSchema.parse(req.body);
    await repo.substituteBot(id, body.policy, body.params);
    return { ok: true };
  });

  app.post('/lab/api/seats/:id/assign', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = AssignSeatSchema.parse(req.body);
    await repo.assignPlayerToSeat(id, body.playerId);
    return { ok: true };
  });

  // ── Results & Debrief Endpoint (API.md §4) ──
  app.get('/lab/api/runs/:id/results', async (req, reply) => {
    const { id } = req.params as { id: string };
    const run = await repo.getRunById(id);
    if (!run) return reply.status(404).send({ error: { code: 'not_found', message: 'Run not found' } });

    const scenarioRow = await db.selectFrom('scenario').selectAll().where('id', '=', run.scenario_id).executeTakeFirst();
    const scenario: Scenario = scenarioRow ? JSON.parse(scenarioRow.params) : {
      name: 'Classic',
      weeks: 36,
      echelons: 4,
      initialInventory: 12,
      initialBacklog: 0,
      initialIncomingOrder: 4,
      initialPipelineUnits: 4,
      orderDelay: 1,
      shippingDelay: 2,
      productionLeadTime: 2,
      holdCostCents: 50,
      backCostCents: 100,
      demand: { kind: 'step', initialValue: 4, stepWeek: 5, stepValue: 8 },
      informationSharing: false,
      lostSales: false
    };

    const teams = await repo.getTeamsForRun(id);
    const allWeekStates = await repo.getWeekStatesForRun(id);
    const utterances = await repo.getUtterancesForRun(id);
    const predictions = await repo.getPredictionsForRun(id);

    // Build true end customer demand series
    const demandSeries: number[] = [];
    let dummyRng = run.rng_seed;
    for (let w = 1; w <= run.weeks_planned; w++) {
      const d = demandAt(scenario, w, dummyRng);
      dummyRng = d.rngState;
      demandSeries.push(d.value);
    }

    const teamResults = [];
    for (const team of teams) {
      const teamStates = allWeekStates.filter(s => s.team_id === team.id);

      const maxWeek = teamStates.length > 0 ? Math.max(...teamStates.map(s => s.week)) : 0;
      const recordsByWeek: any[][] = [];
      for (let w = 1; w <= maxWeek; w++) {
        const weekRecs: any[] = [];
        for (let e = 0; e < scenario.echelons; e++) {
          const s = teamStates.find(st => st.week === w && st.echelon === e);
          weekRecs.push({
            week: w,
            echelon: e,
            inventory: s ? s.inventory : 12,
            backlog: s ? s.backlog : 0,
            incomingOrder: s ? s.incoming_order : 4,
            shipped: s ? s.shipped : 4,
            orderPlaced: s ? s.order_placed : 4,
            pipeline: s ? JSON.parse(s.pipeline) : [4, 4],
            weekCostCents: s ? s.week_cost_cents : 600,
            cumCostCents: s ? s.cum_cost_cents : 600
          });
        }
        recordsByWeek.push(weekRecs);
      }

      const teamMetrics = computeTeamMetrics(recordsByWeek, demandSeries, scenario.holdCostCents, scenario.backCostCents);
      const byEchelon = teamMetrics.byEchelon.map(ech => {
        const weeks = teamStates
          .filter(s => s.echelon === ech.echelon)
          .sort((a, b) => a.week - b.week)
          .map(s => ({
            week: s.week,
            inventory: s.inventory,
            backlog: s.backlog,
            incomingOrder: s.incoming_order,
            shipped: s.shipped,
            orderPlaced: s.order_placed,
            pipeline: JSON.parse(s.pipeline),
            weekCostCents: s.week_cost_cents,
            cumCostCents: s.cum_cost_cents,
            latencyMs: 1500,
            filledByBot: s.filled_by_bot === 1
          }));
        return {
          ...ech,
          weeks
        };
      });

      const teamTotalCents = byEchelon.reduce((acc, ech) => acc + ech.totalCents, 0);

      teamResults.push({
        id: team.id,
        name: team.name,
        totalCents: teamTotalCents,
        byEchelon,
        predictions: predictions.filter(p => p.subject_id === team.id),
        utterances: utterances.filter(u => u.run_id === run.id)
      });
    }

    return {
      run: {
        id: run.id,
        label: run.label,
        weeksPlayed: run.weeks_played,
        engineVersion: run.engine_version
      },
      benchmark: run.benchmark ? JSON.parse(run.benchmark) : runBenchmark(scenario, [28, 28, 28, 20]),
      teams: teamResults,
      demand: demandSeries
    };
  });

  // Public read-only debrief (/r/:publishedId)
  app.get('/lab/api/r/:publishedId', async (req, reply) => {
    const { publishedId } = req.params as { publishedId: string };
    return reply.redirect(`/lab/api/runs/${publishedId}/results`);
  });

  // ── Player Endpoints ──

  app.post('/lab/api/join', async (req, reply) => {
    const body = JoinSchema.parse(req.body);
    const session = await repo.getSessionByJoinCode(body.joinCode);
    if (!session || session.status === 'closed') {
      return reply.status(404).send({ error: { code: 'invalid_join_code', message: 'Invalid or closed session' } });
    }

    const runs = await repo.getRunsForSession(session.id);
    const run = runs.find(r => r.status === 'running' || r.status === 'pending') || runs[0];
    if (!run) {
      return reply.status(400).send({ error: { code: 'no_run', message: 'No run currently active' } });
    }

    // Generate player token
    const playerToken = crypto.randomBytes(24).toString('base64url');
    const tokenHash = hashToken(playerToken);
    const playerId = await repo.createPlayer(session.id, body.displayName, tokenHash);

    // Find available bot-held seat across teams in this run
    const teams = await repo.getTeamsForRun(run.id);
    let chosenSeat: any = null;
    let chosenTeam: any = null;

    for (const team of teams) {
      const seats = await repo.getSeatsForTeam(team.id);
      const availableSeat = seats.find(s => s.holder_type === 'bot' || !s.player_id);
      if (availableSeat) {
        chosenSeat = availableSeat;
        chosenTeam = team;
        break;
      }
    }

    if (!chosenSeat) {
      // Create a new team if no open seats
      chosenTeam = await repo.createTeam(session.id, run.id, `Team ${teams.length + 1}`);
      for (let e = 0; e < 4; e++) {
        const s = await repo.createSeat({
          teamId: chosenTeam.id,
          echelon: e,
          holderType: e === 0 ? 'human' : 'bot',
          botPolicy: 'base-stock',
          playerId: e === 0 ? playerId : null
        });
        if (e === 0) chosenSeat = s;
      }
    } else {
      await repo.assignPlayerToSeat(chosenSeat.id, playerId);
    }

    return {
      playerToken,
      playerId,
      seatId: chosenSeat.id,
      teamId: chosenTeam.id,
      runId: run.id,
      echelon: chosenSeat.echelon
    };
  });

  app.post('/lab/api/rejoin', async (req, reply) => {
    const body = RejoinSchema.parse(req.body);
    const tokenHash = hashToken(body.playerToken);
    const player = await repo.getPlayerByTokenHash(tokenHash);
    if (!player) {
      return reply.status(404).send({ error: { code: 'invalid_token', message: 'Player token not found' } });
    }

    const session = await repo.getSessionById(player.session_id);
    if (session?.status === 'closed') {
      return reply.status(410).send({ error: { code: 'session_closed', message: 'Session is closed' } });
    }

    const runs = await repo.getRunsForSession(player.session_id);
    const activeRun = runs.find(r => r.status === 'running' || r.status === 'pending') || runs[0];
    if (!activeRun) {
      return reply.status(400).send({ error: { code: 'no_run', message: 'No active run' } });
    }

    const seat = await repo.findSeatForPlayer(activeRun.id, player.id);
    if (!seat) {
      return reply.status(404).send({ error: { code: 'no_seat', message: 'No seat assigned to player' } });
    }

    return {
      playerToken: body.playerToken,
      playerId: player.id,
      seatId: seat.id,
      teamId: seat.team_id,
      runId: activeRun.id,
      echelon: seat.echelon
    };
  });

  app.get('/lab/api/me/state', async (req, reply) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '') || (req.query as any)?.token;
    if (!token) return reply.status(401).send({ error: { code: 'unauthorized', message: 'Missing player token' } });

    const player = await repo.getPlayerByTokenHash(hashToken(token));
    if (!player) return reply.status(401).send({ error: { code: 'unauthorized', message: 'Invalid token' } });

    const runs = await repo.getRunsForSession(player.session_id);
    const activeRun = runs.find(r => r.status === 'running' || r.status === 'paused') || runs[0];
    if (!activeRun) return reply.status(404).send({ error: { code: 'no_run', message: 'No run active' } });

    const seat = await repo.findSeatForPlayer(activeRun.id, player.id);
    if (!seat) return reply.status(404).send({ error: { code: 'no_seat', message: 'No seat' } });

    const room = await roomManager.getOrCreateRoom(seat.team_id);
    const payload = await room.buildPlayerStatePayload(seat.echelon);
    return payload;
  });

  app.post('/lab/api/me/order', async (req, reply) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '') || (req.query as any)?.token;
    if (!token) return reply.status(401).send({ error: { code: 'unauthorized', message: 'Missing token' } });

    const player = await repo.getPlayerByTokenHash(hashToken(token));
    if (!player) return reply.status(401).send({ error: { code: 'unauthorized', message: 'Invalid token' } });

    const runs = await repo.getRunsForSession(player.session_id);
    const activeRun = runs.find(r => r.status === 'running');
    if (!activeRun) return reply.status(409).send({ error: { code: 'run_not_running', message: 'Run not running' } });

    const seat = await repo.findSeatForPlayer(activeRun.id, player.id);
    if (!seat) return reply.status(404).send({ error: { code: 'no_seat', message: 'No seat' } });

    const body = SubmitOrderSchema.parse(req.body);
    const room = await roomManager.getOrCreateRoom(seat.team_id);

    try {
      const res = await room.submitOrder({
        echelon: seat.echelon,
        seatId: seat.id,
        week: body.week,
        quantity: body.quantity,
        submittedBy: 'human',
        clientMsgId: body.clientMsgId
      });
      return { ok: true, duplicate: res.duplicate };
    } catch (err: any) {
      if (err.message === 'stale_week') {
        return reply.status(409).send({ error: { code: 'stale_week', message: 'Order for stale week' } });
      }
      return reply.status(400).send({ error: { code: 'error', message: err.message } });
    }
  });

  app.post('/lab/api/me/utterance', async (req, reply) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '') || (req.query as any)?.token;
    const player = token ? await repo.getPlayerByTokenHash(hashToken(token)) : null;
    if (!player) return reply.status(401).send({ error: { code: 'unauthorized', message: 'Invalid token' } });

    const body = SubmitUtteranceSchema.parse(req.body);
    const runs = await repo.getRunsForSession(player.session_id);
    const activeRun = runs[0];
    const seat = activeRun ? await repo.findSeatForPlayer(activeRun.id, player.id) : null;

    const id = await repo.createUtterance({
      runId: activeRun?.id || 'unknown',
      seatId: seat?.id || 'unknown',
      week: body.week,
      kind: body.kind,
      promptId: body.promptId,
      body: body.body
    });
    return { ok: true, id };
  });

  app.post('/lab/api/me/prediction', async (req, reply) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '') || (req.query as any)?.token;
    const player = token ? await repo.getPlayerByTokenHash(hashToken(token)) : null;
    if (!player) return reply.status(401).send({ error: { code: 'unauthorized', message: 'Invalid token' } });

    const body = SubmitPredictionSchema.parse(req.body);
    const runs = await repo.getRunsForSession(player.session_id);
    const activeRun = runs[0];
    const seat = activeRun ? await repo.findSeatForPlayer(activeRun.id, player.id) : null;

    const id = await repo.createPrediction({
      runId: activeRun?.id || 'unknown',
      subjectType: 'player',
      subjectId: player.id,
      statement: body.statement,
      predictedDirection: body.predictedDirection
    });
    return { ok: true, id };
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ── 2. WebSocket Protocol (/lab/ws)
  // ═══════════════════════════════════════════════════════════════════════

  app.get('/lab/ws', { websocket: true }, async (socket, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const role = url.searchParams.get('role');
    const sessionId = url.searchParams.get('sessionId');

    if (role === 'facilitator' && sessionId) {
      roomManager.registerFacilitator(sessionId, socket);
      return;
    }

    if (!token) {
      socket.send(JSON.stringify({ type: 'error', payload: { code: 'unauthorized', message: 'Missing token' } }));
      socket.close();
      return;
    }

    const player = await repo.getPlayerByTokenHash(hashToken(token));
    if (!player) {
      socket.send(JSON.stringify({ type: 'error', payload: { code: 'unauthorized', message: 'Invalid token' } }));
      socket.close();
      return;
    }

    const runs = await repo.getRunsForSession(player.session_id);
    const activeRun = runs.find(r => r.status === 'running' || r.status === 'paused') || runs[0];
    if (!activeRun) {
      socket.send(JSON.stringify({ type: 'error', payload: { code: 'no_run', message: 'No run active' } }));
      socket.close();
      return;
    }

    const seat = await repo.findSeatForPlayer(activeRun.id, player.id);
    if (!seat) {
      socket.send(JSON.stringify({ type: 'error', payload: { code: 'no_seat', message: 'Seat not found' } }));
      socket.close();
      return;
    }

    const room = await roomManager.getOrCreateRoom(seat.team_id);
    room.registerSocket(seat.echelon, socket);

    socket.on('message', async (raw: any) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'heartbeat') {
          await repo.updatePlayerLastSeen(player.id);
        } else if (msg.type === 'submit_order') {
          const body = SubmitOrderSchema.parse(msg.payload);
          try {
            await room.submitOrder({
              echelon: seat.echelon,
              seatId: seat.id,
              week: body.week,
              quantity: body.quantity,
              submittedBy: 'human',
              clientMsgId: body.clientMsgId
            });
          } catch (err: any) {
            socket.send(JSON.stringify({
              type: 'error',
              payload: { code: err.message, currentWeek: room.prepRound?.targetWeek }
            }));
          }
        } else if (msg.type === 'submit_utterance') {
          const body = SubmitUtteranceSchema.parse(msg.payload);
          await repo.createUtterance({
            runId: activeRun.id,
            seatId: seat.id,
            week: body.week,
            kind: body.kind,
            promptId: body.promptId,
            body: body.body
          });
        }
      } catch (err: any) {
        socket.send(JSON.stringify({ type: 'error', payload: { code: 'bad_request', message: err.message } }));
      }
    });
  });

  return app;
}

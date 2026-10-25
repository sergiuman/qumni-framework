import { Kysely } from 'kysely';
import crypto from 'crypto';
import { Database, SessionTable, RunTable, TeamTable, SeatTable, WeekStateTable, DecisionTable } from '../db/schema.js';

export class Repository {
  constructor(private db: Kysely<Database>) {}

  // ── Session ──
  async createSession(data: {
    facilitatorId: string;
    title: string;
    joinCode: string;
    status?: 'draft' | 'lobby' | 'running';
  }): Promise<SessionTable> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const session: SessionTable = {
      id,
      facilitator_id: data.facilitatorId,
      experience_id: null,
      title: data.title,
      join_code: data.joinCode,
      status: data.status ?? 'lobby',
      created_at: now,
      closed_at: null
    };
    await this.db.insertInto('session').values(session).execute();
    return session;
  }

  async getSessionById(id: string): Promise<SessionTable | undefined> {
    return this.db.selectFrom('session').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async getSessionByJoinCode(joinCode: string): Promise<SessionTable | undefined> {
    return this.db.selectFrom('session').selectAll().where('join_code', '=', joinCode).executeTakeFirst();
  }

  async updateSessionStatus(id: string, status: 'draft' | 'lobby' | 'running' | 'finished' | 'closed'): Promise<void> {
    const closed_at = status === 'closed' ? new Date().toISOString() : null;
    await this.db.updateTable('session')
      .set({ status, closed_at })
      .where('id', '=', id)
      .execute();
  }

  async listSessions(): Promise<SessionTable[]> {
    return this.db.selectFrom('session').selectAll().orderBy('created_at', 'desc').execute();
  }

  // ── Player ──
  async createPlayer(sessionId: string, displayName: string, tokenHash: string): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.insertInto('player').values({
      id,
      session_id: sessionId,
      display_name: displayName,
      token_hash: tokenHash,
      joined_at: now,
      last_seen_at: now
    }).execute();
    return id;
  }

  async getPlayerByTokenHash(tokenHash: string) {
    return this.db.selectFrom('player').selectAll().where('token_hash', '=', tokenHash).executeTakeFirst();
  }

  async updatePlayerLastSeen(id: string): Promise<void> {
    await this.db.updateTable('player')
      .set({ last_seen_at: new Date().toISOString() })
      .where('id', '=', id)
      .execute();
  }

  // ── Run ──
  async createRun(data: {
    sessionId: string;
    scenarioId: string;
    idx: number;
    label: string;
    advancement: 'timer' | 'wait_all' | 'async';
    roundSeconds: number | null;
    weeksPlanned: number;
    rngSeed: number;
    engineVersion: string;
    benchmark?: any;
  }): Promise<RunTable> {
    const id = crypto.randomUUID();
    const run: RunTable = {
      id,
      session_id: data.sessionId,
      scenario_id: data.scenarioId,
      idx: data.idx,
      label: data.label,
      status: 'pending',
      advancement: data.advancement,
      round_seconds: data.roundSeconds,
      weeks_planned: data.weeksPlanned,
      weeks_played: 0,
      rng_seed: data.rngSeed,
      engine_version: data.engineVersion,
      benchmark: data.benchmark ? JSON.stringify(data.benchmark) : null,
      started_at: null,
      ended_at: null
    };
    await this.db.insertInto('run').values(run).execute();
    return run;
  }

  async getRunById(id: string): Promise<RunTable | undefined> {
    return this.db.selectFrom('run').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async getRunsForSession(sessionId: string): Promise<RunTable[]> {
    return this.db.selectFrom('run').selectAll().where('session_id', '=', sessionId).orderBy('idx', 'asc').execute();
  }

  async updateRunStatus(id: string, status: 'pending' | 'running' | 'paused' | 'finished' | 'aborted'): Promise<void> {
    const now = new Date().toISOString();
    const updates: Partial<RunTable> = { status };
    if (status === 'running') updates.started_at = now;
    if (status === 'finished' || status === 'aborted') updates.ended_at = now;
    await this.db.updateTable('run').set(updates).where('id', '=', id).execute();
  }

  async updateRunWeeksPlayed(id: string, weeksPlayed: number): Promise<void> {
    await this.db.updateTable('run').set({ weeks_played: weeksPlayed }).where('id', '=', id).execute();
  }

  // ── Team ──
  async createTeam(sessionId: string, runId: string, name: string): Promise<TeamTable> {
    const id = crypto.randomUUID();
    const team: TeamTable = {
      id,
      session_id: sessionId,
      run_id: runId,
      name,
      current_week: 0,
      status: 'waiting',
      deadline_at: null
    };
    await this.db.insertInto('team').values(team).execute();
    return team;
  }

  async getTeamsForRun(runId: string): Promise<TeamTable[]> {
    return this.db.selectFrom('team').selectAll().where('run_id', '=', runId).execute();
  }

  async getTeamById(id: string): Promise<TeamTable | undefined> {
    return this.db.selectFrom('team').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async updateTeamState(id: string, updates: { current_week?: number; status?: 'waiting' | 'running' | 'finished'; deadline_at?: string | null }): Promise<void> {
    await this.db.updateTable('team').set(updates).where('id', '=', id).execute();
  }

  // ── Seat ──
  async createSeat(data: {
    teamId: string;
    echelon: number;
    holderType: 'human' | 'bot';
    botPolicy?: 'naive' | 'base-stock' | 'sterman' | 'scripted' | null;
    botParams?: any;
    playerId?: string | null;
  }): Promise<SeatTable> {
    const id = crypto.randomUUID();
    const seat: SeatTable = {
      id,
      team_id: data.teamId,
      echelon: data.echelon,
      holder_type: data.holderType,
      bot_policy: data.botPolicy ?? null,
      bot_params: data.botParams ? JSON.stringify(data.botParams) : null,
      bot_memory: '{}',
      player_id: data.playerId ?? null
    };
    await this.db.insertInto('seat').values(seat).execute();
    return seat;
  }

  async getSeatsForTeam(teamId: string): Promise<SeatTable[]> {
    return this.db.selectFrom('seat').selectAll().where('team_id', '=', teamId).orderBy('echelon', 'asc').execute();
  }

  async getSeatById(id: string): Promise<SeatTable | undefined> {
    return this.db.selectFrom('seat').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async findSeatForPlayer(runId: string, playerId: string) {
    return this.db.selectFrom('seat')
      .innerJoin('team', 'team.id', 'seat.team_id')
      .selectAll('seat')
      .select('team.name as team_name')
      .where('team.run_id', '=', runId)
      .where('seat.player_id', '=', playerId)
      .executeTakeFirst();
  }

  async assignPlayerToSeat(seatId: string, playerId: string): Promise<void> {
    await this.db.updateTable('seat')
      .set({ player_id: playerId, holder_type: 'human' })
      .where('id', '=', seatId)
      .execute();
  }

  async substituteBot(seatId: string, policy: 'naive' | 'base-stock' | 'sterman' | 'scripted', params?: any): Promise<void> {
    await this.db.updateTable('seat')
      .set({
        holder_type: 'bot',
        bot_policy: policy,
        bot_params: params ? JSON.stringify(params) : null
      })
      .where('id', '=', seatId)
      .execute();
  }

  async updateBotMemory(seatId: string, memory: Record<string, number>): Promise<void> {
    await this.db.updateTable('seat')
      .set({ bot_memory: JSON.stringify(memory) })
      .where('id', '=', seatId)
      .execute();
  }

  // ── Decision ──
  async recordDecision(data: {
    seatId: string;
    week: number;
    quantity: number;
    submittedBy: 'human' | 'bot' | 'facilitator';
    clientMsgId?: string | null;
    latencyMs?: number | null;
  }): Promise<DecisionTable> {
    const id = crypto.randomUUID();
    const decision: DecisionTable = {
      id,
      seat_id: data.seatId,
      week: data.week,
      quantity: data.quantity,
      submitted_by: data.submittedBy,
      client_msg_id: data.clientMsgId ?? null,
      latency_ms: data.latencyMs ?? null,
      submitted_at: new Date().toISOString()
    };
    await this.db.insertInto('decision').values(decision).execute();
    return decision;
  }

  async getDecisionByClientMsgId(seatId: string, clientMsgId: string): Promise<DecisionTable | undefined> {
    return this.db.selectFrom('decision')
      .selectAll()
      .where('seat_id', '=', seatId)
      .where('client_msg_id', '=', clientMsgId)
      .executeTakeFirst();
  }

  async getDecisionForSeatWeek(seatId: string, week: number): Promise<DecisionTable | undefined> {
    return this.db.selectFrom('decision')
      .selectAll()
      .where('seat_id', '=', seatId)
      .where('week', '=', week)
      .executeTakeFirst();
  }

  async getDecisionsForTeamWeek(teamId: string, week: number) {
    return this.db.selectFrom('decision')
      .innerJoin('seat', 'seat.id', 'decision.seat_id')
      .selectAll('decision')
      .select('seat.echelon as echelon')
      .where('seat.team_id', '=', teamId)
      .where('decision.week', '=', week)
      .execute();
  }

  // ── Week State ──
  async recordWeekStates(states: Array<{
    teamId: string;
    echelon: number;
    week: number;
    inventory: number;
    backlog: number;
    incomingOrder: number;
    shipped: number;
    orderPlaced: number;
    pipeline: number[];
    weekCostCents: number;
    cumCostCents: number;
    filledByBot: boolean;
  }>): Promise<void> {
    const rows: WeekStateTable[] = states.map(s => ({
      id: crypto.randomUUID(),
      team_id: s.teamId,
      echelon: s.echelon,
      week: s.week,
      inventory: s.inventory,
      backlog: s.backlog,
      incoming_order: s.incomingOrder,
      shipped: s.shipped,
      order_placed: s.orderPlaced,
      pipeline: JSON.stringify(s.pipeline),
      week_cost_cents: s.weekCostCents,
      cum_cost_cents: s.cumCostCents,
      filled_by_bot: s.filledByBot ? 1 : 0,
      created_at: new Date().toISOString()
    }));

    if (rows.length > 0) {
      await this.db.insertInto('week_state').values(rows).execute();
    }
  }

  async getWeekStatesForTeam(teamId: string): Promise<WeekStateTable[]> {
    return this.db.selectFrom('week_state')
      .selectAll()
      .where('team_id', '=', teamId)
      .orderBy('week', 'asc')
      .orderBy('echelon', 'asc')
      .execute();
  }

  async getWeekStatesForRun(runId: string) {
    return this.db.selectFrom('week_state')
      .innerJoin('team', 'team.id', 'week_state.team_id')
      .selectAll('week_state')
      .select('team.name as team_name')
      .where('team.run_id', '=', runId)
      .orderBy('week_state.week', 'asc')
      .orderBy('week_state.echelon', 'asc')
      .execute();
  }

  // ── Session Event ──
  async logSessionEvent(data: {
    sessionId: string;
    runId?: string | null;
    teamId?: string | null;
    seatId?: string | null;
    type: string;
    payload?: any;
  }): Promise<void> {
    await this.db.insertInto('session_event').values({
      id: crypto.randomUUID(),
      session_id: data.sessionId,
      run_id: data.runId ?? null,
      team_id: data.teamId ?? null,
      seat_id: data.seatId ?? null,
      type: data.type,
      payload: JSON.stringify(data.payload ?? {}),
      at: new Date().toISOString()
    }).execute();
  }

  // ── Learning: Prediction & Utterance ──
  async createPrediction(data: {
    experimentId?: string | null;
    runId: string;
    subjectType: 'player' | 'team';
    subjectId: string;
    statement: string;
    predictedDirection?: 'up' | 'down' | 'same' | 'unsure' | null;
  }) {
    const id = crypto.randomUUID();
    await this.db.insertInto('prediction').values({
      id,
      experiment_id: data.experimentId ?? null,
      run_id: data.runId,
      subject_type: data.subjectType,
      subject_id: data.subjectId,
      statement: data.statement,
      predicted_direction: data.predictedDirection ?? null,
      made_at: new Date().toISOString(),
      resolved_outcome: null,
      accuracy: null
    }).execute();
    return id;
  }

  async createUtterance(data: {
    runId: string;
    seatId: string;
    week?: number | null;
    kind: 'belief' | 'reflection' | 'mental_model';
    promptId: string;
    body: string;
    visibility?: 'private' | 'facilitator' | 'org';
  }) {
    const id = crypto.randomUUID();
    await this.db.insertInto('utterance').values({
      id,
      run_id: data.runId,
      seat_id: data.seatId,
      week: data.week ?? null,
      kind: data.kind,
      prompt_id: data.promptId,
      body: data.body,
      visibility: data.visibility ?? 'facilitator',
      created_at: new Date().toISOString()
    }).execute();
    return id;
  }

  async getUtterancesForRun(runId: string) {
    return this.db.selectFrom('utterance').selectAll().where('run_id', '=', runId).execute();
  }

  async getPredictionsForRun(runId: string) {
    return this.db.selectFrom('prediction').selectAll().where('run_id', '=', runId).execute();
  }
}

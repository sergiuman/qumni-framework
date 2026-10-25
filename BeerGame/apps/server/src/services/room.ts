import {
  Scenario,
  TeamState,
  WeekRecord,
  initTeam,
  advanceToDecision,
  commitOrders,
  PreparedRound,
  createBot,
  BotContext
} from '@lab/engine';
import { Kysely } from 'kysely';
import { Database, SeatTable, TeamTable } from '../db/schema.js';
import { Repository } from '../repo/index.js';
import { WebSocket } from 'ws';

export interface PlayerSocket {
  seatId: string;
  playerId: string;
  echelon: number;
  ws: WebSocket;
}

export class TeamRoom {
  public teamId: string;
  public runId: string;
  public scenario: Scenario;
  public teamState: TeamState;
  public prepRound: PreparedRound | null = null;
  public pendingDecisions: Map<number, { quantity: number; submittedBy: 'human' | 'bot' | 'facilitator'; clientMsgId?: string; latencyMs?: number }> = new Map();
  public sockets: Map<number, WebSocket> = new Map(); // echelon -> ws
  public isAdvancing = false;
  private timerHandle: NodeJS.Timeout | null = null;

  constructor(
    public team: TeamTable,
    public seats: SeatTable[],
    scenario: Scenario,
    private repo: Repository,
    private db: Kysely<Database>,
    private onTeamUpdated?: () => void
  ) {
    this.teamId = team.id;
    this.runId = team.run_id;
    this.scenario = scenario;
    this.teamState = initTeam(scenario);
  }

  /**
   * Rebuilds state from database on boot / room initialization.
   */
  async restoreFromDb(): Promise<void> {
    const states = await this.repo.getWeekStatesForTeam(this.teamId);
    if (states.length === 0) {
      // Team is at initial state
      this.teamState = initTeam(this.scenario);
      return;
    }

    // Determine current completed week
    const maxWeek = Math.max(...states.map(s => s.week));
    this.team.current_week = maxWeek;

    // Load decisions for all weeks and replay to restore exact rngState and internal queues
    this.teamState = initTeam(this.scenario);
    for (let w = 1; w <= maxWeek; w++) {
      const decisions = await this.repo.getDecisionsForTeamWeek(this.teamId, w);
      const orders = Array(this.scenario.echelons).fill(4);
      for (const d of decisions) {
        if (d.echelon >= 0 && d.echelon < this.scenario.echelons) {
          orders[d.echelon] = d.quantity;
        }
      }
      const prep = advanceToDecision(this.scenario, this.teamState);
      const committed = commitOrders(this.scenario, prep, orders);
      this.teamState = committed.state;
    }
  }

  /**
   * Begins or resumes the current week's decision round.
   */
  async startRound(roundSeconds?: number | null): Promise<void> {
    if (this.team.status === 'finished') return;

    this.pendingDecisions.clear();
    this.prepRound = advanceToDecision(this.scenario, this.teamState);

    const now = Date.now();
    let deadlineIso: string | null = null;
    if (roundSeconds && roundSeconds > 0) {
      const deadline = new Date(now + roundSeconds * 1000);
      deadlineIso = deadline.toISOString();
      if (this.timerHandle) clearTimeout(this.timerHandle);
      this.timerHandle = setTimeout(() => {
        this.onTimerExpired().catch(console.error);
      }, roundSeconds * 1000);
    }

    this.team.status = 'running';
    this.team.deadline_at = deadlineIso;
    await this.repo.updateTeamState(this.teamId, {
      current_week: this.prepRound.targetWeek,
      status: 'running',
      deadline_at: deadlineIso
    });

    // Notify connected players
    this.broadcastState();
    this.onTeamUpdated?.();
  }

  /**
   * Submits an order for an echelon seat with idempotency protection.
   */
  async submitOrder(params: {
    echelon: number;
    seatId: string;
    week: number;
    quantity: number;
    submittedBy: 'human' | 'bot' | 'facilitator';
    clientMsgId?: string;
    latencyMs?: number;
  }): Promise<{ accepted: boolean; duplicate?: boolean }> {
    // Check idempotency first if clientMsgId provided (API.md §3 rule 1)
    if (params.clientMsgId) {
      const existing = await this.repo.getDecisionByClientMsgId(params.seatId, params.clientMsgId);
      if (existing) {
        return { accepted: true, duplicate: true };
      }
    }

    if (!this.prepRound) {
      return { accepted: false };
    }

    if (params.week !== this.prepRound.targetWeek) {
      throw new Error('stale_week');
    }

    this.pendingDecisions.set(params.echelon, {
      quantity: params.quantity,
      submittedBy: params.submittedBy,
      clientMsgId: params.clientMsgId,
      latencyMs: params.latencyMs
    });

    // Send state update confirming order awaiting = false
    this.sendPlayerState(params.echelon);
    this.onTeamUpdated?.();

    // If wait_all mode and all human seats have submitted, close round!
    const allSubmitted = this.seats.every(seat => {
      if (seat.holder_type === 'bot') return true;
      return this.pendingDecisions.has(seat.echelon);
    });

    if (allSubmitted) {
      if (this.timerHandle) {
        clearTimeout(this.timerHandle);
        this.timerHandle = null;
      }
      await this.closeRound();
    }

    return { accepted: true };
  }

  private async onTimerExpired(): Promise<void> {
    await this.closeRound();
  }

  /**
   * Closes the round, fills missing orders from bot policy, and persists everything.
   */
  public async closeRound(): Promise<void> {
    // In-process team lock
    if (this.isAdvancing || !this.prepRound) return;
    this.isAdvancing = true;

    try {
      const prep = this.prepRound;
      const targetWeek = prep.targetWeek;
      const orders: number[] = Array(this.scenario.echelons).fill(0);
      const decisionsToRecord: Array<{
        seatId: string;
        week: number;
        quantity: number;
        submittedBy: 'human' | 'bot' | 'facilitator';
        clientMsgId?: string | null;
        latencyMs?: number | null;
      }> = [];

      // For history lookups in bot policy
      const histories = await this.repo.getWeekStatesForTeam(this.teamId);

      for (let e = 0; e < this.scenario.echelons; e++) {
        const seat = this.seats.find(s => s.echelon === e);
        const seatId = seat?.id ?? `seat-${e}`;
        const submitted = this.pendingDecisions.get(e);

        if (submitted) {
          orders[e] = submitted.quantity;
          decisionsToRecord.push({
            seatId,
            week: targetWeek,
            quantity: submitted.quantity,
            submittedBy: submitted.submittedBy,
            clientMsgId: submitted.clientMsgId,
            latencyMs: submitted.latencyMs
          });
        } else {
          // Seat timed out or is a bot: run bot policy
          const policy = seat?.bot_policy ?? 'base-stock';
          const bot = createBot(policy);
          const historyForEchelon = histories
            .filter(h => h.echelon === e)
            .map(h => ({
              incomingOrder: h.incoming_order,
              inventory: h.inventory,
              backlog: h.backlog
            }));

          const botCtx: BotContext = {
            scenario: this.scenario,
            echelon: e,
            self: prep.echelons[e],
            supplierBacklog: prep.echelons[e + 1]?.backlog ?? 0,
            history: historyForEchelon,
            memory: seat?.bot_memory ? JSON.parse(seat.bot_memory) : {}
          };

          const botOrder = bot.decide(botCtx);
          orders[e] = botOrder;
          decisionsToRecord.push({
            seatId,
            week: targetWeek,
            quantity: botOrder,
            submittedBy: 'bot',
            latencyMs: null
          });
        }
      }

      // Step 5: commit orders in pure engine
      const { state: nextState, records } = commitOrders(this.scenario, prep, orders);
      this.teamState = nextState;

      // ── Persist decisions and week_state rows in one synchronous transaction ──
      await this.db.transaction().execute(async trx => {
        // Record decisions
        for (const d of decisionsToRecord) {
          await trx.insertInto('decision').values({
            id: crypto.randomUUID(),
            seat_id: d.seatId,
            week: d.week,
            quantity: d.quantity,
            submitted_by: d.submittedBy,
            client_msg_id: d.clientMsgId ?? null,
            latency_ms: d.latencyMs ?? null,
            submitted_at: new Date().toISOString()
          }).execute();
        }

        // Record week_state rows
        for (let e = 0; e < this.scenario.echelons; e++) {
          const rec = records[e];
          const isBot = decisionsToRecord.find(d => d.seatId === (this.seats.find(s => s.echelon === e)?.id))?.submittedBy === 'bot';
          await trx.insertInto('week_state').values({
            id: crypto.randomUUID(),
            team_id: this.teamId,
            echelon: e,
            week: targetWeek,
            inventory: rec.inventory,
            backlog: rec.backlog,
            incoming_order: rec.incomingOrder,
            shipped: rec.shipped,
            order_placed: rec.orderPlaced,
            pipeline: JSON.stringify(rec.pipeline),
            week_cost_cents: rec.weekCostCents,
            cum_cost_cents: rec.cumCostCents,
            filled_by_bot: isBot ? 1 : 0,
            created_at: new Date().toISOString()
          }).execute();
        }

        // Update team
        const isFinished = targetWeek >= this.scenario.weeks;
        await trx.updateTable('team').set({
          current_week: targetWeek,
          status: isFinished ? 'finished' : 'waiting',
          deadline_at: null
        }).where('id', '=', this.teamId).execute();
      });

      this.team.current_week = targetWeek;
      this.prepRound = null;

      // Broadcast round_closed (isolated per seat)
      for (let e = 0; e < this.scenario.echelons; e++) {
        const ws = this.sockets.get(e);
        if (ws && ws.readyState === WebSocket.OPEN) {
          const rec = records[e];
          const isBot = decisionsToRecord.find(d => d.seatId === (this.seats.find(s => s.echelon === e)?.id))?.submittedBy === 'bot';
          ws.send(JSON.stringify({
            type: 'round_closed',
            payload: {
              week: targetWeek,
              arrived: e === this.scenario.echelons - 1 ? (rec.pipeline[0] ?? 0) : (rec.pipeline[0] ?? 0),
              shipped: rec.shipped,
              inventory: rec.inventory,
              backlog: rec.backlog,
              weekCostCents: rec.weekCostCents,
              filledByBot: isBot
            }
          }));
        }
      }

      // Check if finished
      if (targetWeek >= this.scenario.weeks) {
        this.team.status = 'finished';
        for (let e = 0; e < this.scenario.echelons; e++) {
          const ws = this.sockets.get(e);
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'run_ended',
              payload: {
                weeksPlayed: targetWeek,
                ownCumCostCents: records[e].cumCostCents,
                debriefUrl: `/lab/r/${this.runId}`
              }
            }));
          }
        }
        this.onTeamUpdated?.();
        return;
      }

      // Advance to next round if mode is timer
      const run = await this.repo.getRunById(this.runId);
      if (run?.status === 'running') {
        await this.startRound(run.round_seconds);
      } else {
        this.broadcastState();
      }
    } finally {
      this.isAdvancing = false;
    }
  }

  /**
   * Builds the isolated state payload for a given echelon.
   * Normative rule (API.md §2):
   * "The state payload is built per seat and contains no other echelon's figures unless
   * scenario.informationSharing is true, in which case it gains endCustomerDemand and
   * nothing else."
   */
  public async buildPlayerStatePayload(echelon: number): Promise<any> {
    const ech = this.teamState.echelons[echelon];
    const histories = await this.repo.getWeekStatesForTeam(this.teamId);
    const ownHistory = histories
      .filter(h => h.echelon === echelon)
      .map(h => ({
        week: h.week,
        inventory: h.inventory,
        backlog: h.backlog,
        incomingOrder: h.incoming_order,
        shipped: h.shipped,
        orderPlaced: h.order_placed,
        weekCostCents: h.week_cost_cents,
        cumCostCents: h.cum_cost_cents
      }));

    const roles = ['Retailer', 'Wholesaler', 'Distributor', 'Factory'];
    const currentWeek = this.prepRound ? this.prepRound.targetWeek : this.team.current_week;
    const awaitingOrder = this.prepRound ? !this.pendingDecisions.has(echelon) : false;

    const payload: any = {
      week: currentWeek,
      revealedEndWeek: null, // Sterman blind test: end week hidden unless scenario explicitly reveals
      inventory: this.prepRound ? this.prepRound.echelons[echelon].inventory : ech.inventory,
      backlog: this.prepRound ? this.prepRound.echelons[echelon].backlog : ech.backlog,
      incomingOrder: this.prepRound ? this.prepRound.incomingOrderRecorded[echelon] : ech.incomingOrder,
      pipeline: this.prepRound
        ? (echelon === this.scenario.echelons - 1 ? this.prepRound.echelons[echelon].wip : this.prepRound.echelons[echelon].shipping)
        : (echelon === this.scenario.echelons - 1 ? ech.wip : ech.shipping),
      costCentsThisWeek: this.prepRound ? this.prepRound.weekCosts[echelon] : 0,
      cumCostCents: this.prepRound ? this.prepRound.echelons[echelon].cumCostCents : ech.cumCostCents,
      history: ownHistory,
      deadlineAt: this.team.deadline_at,
      awaitingOrder,
      role: roles[echelon] || `Echelon ${echelon}`,
      teamName: this.team.name
    };

    if (this.scenario.informationSharing && this.prepRound) {
      payload.endCustomerDemand = this.prepRound.echelons[0].incomingOrder;
    }

    return payload;
  }

  public async sendPlayerState(echelon: number): Promise<void> {
    const ws = this.sockets.get(echelon);
    if (ws && ws.readyState === WebSocket.OPEN) {
      const payload = await this.buildPlayerStatePayload(echelon);
      ws.send(JSON.stringify({ type: 'state', payload }));
    }
  }

  public async broadcastState(): Promise<void> {
    for (let e = 0; e < this.scenario.echelons; e++) {
      await this.sendPlayerState(e);
    }
  }

  public registerSocket(echelon: number, ws: WebSocket): void {
    this.sockets.set(echelon, ws);
    this.sendPlayerState(echelon).catch(console.error);

    ws.on('close', () => {
      if (this.sockets.get(echelon) === ws) {
        this.sockets.delete(echelon);
      }
    });
  }
}

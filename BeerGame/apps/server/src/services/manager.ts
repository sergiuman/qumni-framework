import { Kysely } from 'kysely';
import { WebSocket } from 'ws';
import { Database } from '../db/schema.js';
import { Repository } from '../repo/index.js';
import { TeamRoom } from './room.js';
import { Scenario } from '@lab/engine';

export class RoomManager {
  private rooms: Map<string, TeamRoom> = new Map(); // teamId -> TeamRoom
  private facilitatorSockets: Map<string, Set<WebSocket>> = new Map(); // sessionId -> Set<ws>
  private dashboardThrottleTimer: NodeJS.Timeout | null = null;
  private dirtySessions: Set<string> = new Set();

  constructor(
    private db: Kysely<Database>,
    private repo: Repository
  ) {}

  async getOrCreateRoom(teamId: string): Promise<TeamRoom> {
    let room = this.rooms.get(teamId);
    if (room) return room;

    const team = await this.repo.getTeamById(teamId);
    if (!team) throw new Error('Team not found');

    const run = await this.repo.getRunById(team.run_id);
    if (!run) throw new Error('Run not found');

    const scenarioRow = await this.db.selectFrom('scenario').selectAll().where('id', '=', run.scenario_id).executeTakeFirst();
    const scenario: Scenario = scenarioRow ? JSON.parse(scenarioRow.params) : {
      id: 'classic',
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

    const seats = await this.repo.getSeatsForTeam(teamId);
    room = new TeamRoom(
      team,
      seats,
      scenario,
      this.repo,
      this.db,
      () => this.markSessionDirty(team.session_id)
    );
    await room.restoreFromDb();
    this.rooms.set(teamId, room);
    return room;
  }

  async startRun(runId: string): Promise<void> {
    const run = await this.repo.getRunById(runId);
    if (!run) throw new Error('Run not found');

    await this.repo.updateRunStatus(runId, 'running');
    const teams = await this.repo.getTeamsForRun(runId);

    for (const team of teams) {
      const room = await this.getOrCreateRoom(team.id);
      await room.startRound(run.round_seconds);
    }
  }

  async pauseRun(runId: string): Promise<void> {
    await this.repo.updateRunStatus(runId, 'paused');
    const teams = await this.repo.getTeamsForRun(runId);
    for (const team of teams) {
      const room = this.rooms.get(team.id);
      if (room) {
        room.broadcastState().catch(console.error);
      }
    }
  }

  async resumeRun(runId: string): Promise<void> {
    const run = await this.repo.getRunById(runId);
    if (!run) throw new Error('Run not found');
    await this.repo.updateRunStatus(runId, 'running');
    const teams = await this.repo.getTeamsForRun(runId);
    for (const team of teams) {
      const room = await this.getOrCreateRoom(team.id);
      if (room.team.status !== 'finished') {
        await room.startRound(run.round_seconds);
      }
    }
  }

  async stopRun(runId: string): Promise<void> {
    await this.repo.updateRunStatus(runId, 'finished');
    const teams = await this.repo.getTeamsForRun(runId);
    for (const team of teams) {
      const room = this.rooms.get(team.id);
      if (room) {
        room.team.status = 'finished';
        await this.repo.updateTeamState(team.id, { status: 'finished' });
      }
    }
  }

  async forceAdvanceTeam(teamId: string): Promise<void> {
    const room = await this.getOrCreateRoom(teamId);
    await room.closeRound();
  }

  // ── Facilitator Dashboard Management ──
  registerFacilitator(sessionId: string, ws: WebSocket): void {
    let set = this.facilitatorSockets.get(sessionId);
    if (!set) {
      set = new Set();
      this.facilitatorSockets.set(sessionId, set);
    }
    set.add(ws);

    this.sendDashboard(sessionId, ws).catch(console.error);

    ws.on('close', () => {
      set?.delete(ws);
      if (set?.size === 0) {
        this.facilitatorSockets.delete(sessionId);
      }
    });
  }

  markSessionDirty(sessionId: string): void {
    this.dirtySessions.add(sessionId);
    if (!this.dashboardThrottleTimer) {
      // Throttle dashboard broadcasts to at most 1 message per second in aggregate (§2)
      this.dashboardThrottleTimer = setTimeout(() => {
        this.flushDirtyDashboards().catch(console.error);
        this.dashboardThrottleTimer = null;
      }, 1000);
    }
  }

  private async flushDirtyDashboards(): Promise<void> {
    const sessionIds = Array.from(this.dirtySessions);
    this.dirtySessions.clear();

    for (const sid of sessionIds) {
      const sockets = this.facilitatorSockets.get(sid);
      if (sockets && sockets.size > 0) {
        for (const ws of sockets) {
          if (ws.readyState === WebSocket.OPEN) {
            await this.sendDashboard(sid, ws);
          }
        }
      }
    }
  }

  private async sendDashboard(sessionId: string, ws: WebSocket): Promise<void> {
    const runs = await this.repo.getRunsForSession(sessionId);
    const activeRun = runs.find(r => r.status === 'running' || r.status === 'paused') || runs[0];
    if (!activeRun) return;

    const teams = await this.repo.getTeamsForRun(activeRun.id);
    const teamDeltas = [];

    for (const team of teams) {
      const seats = await this.repo.getSeatsForTeam(team.id);
      const room = this.rooms.get(team.id);
      const pendingSeats = room ? seats.filter(s => s.holder_type === 'human' && !room.pendingDecisions.has(s.echelon)).length : 0;
      const weekStates = await this.repo.getWeekStatesForTeam(team.id);
      const cumCostCents = weekStates.reduce((acc, ws) => acc + ws.week_cost_cents, 0);

      teamDeltas.push({
        teamId: team.id,
        teamName: team.name,
        week: team.current_week,
        seatsHuman: seats.filter(s => s.holder_type === 'human').length,
        seatsBot: seats.filter(s => s.holder_type === 'bot').length,
        pendingSeats,
        cumCostCents,
        status: team.status
      });
    }

    ws.send(JSON.stringify({
      type: 'dashboard',
      payload: {
        runId: activeRun.id,
        runStatus: activeRun.status,
        teams: teamDeltas
      }
    }));
  }
}

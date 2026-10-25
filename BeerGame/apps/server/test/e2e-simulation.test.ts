import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server.js';
import { FastifyInstance } from 'fastify';

describe('Beer Game End-to-End Simulation & Results', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.DATABASE_URL = ':memory:';
    process.env.NODE_ENV = 'test';
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Runs a multi-week game with bots, advances rounds, and computes debrief results', async () => {
    // 1. Facilitator creates a session
    const sessRes = await app.inject({
      method: 'POST',
      url: '/lab/api/sessions',
      payload: { title: 'Executive Seminar Cohort 1' }
    });
    expect(sessRes.statusCode).toBe(200);
    const session = sessRes.json();
    expect(session.join_code).toBeDefined();

    // 2. Facilitator creates Run 1
    const runRes = await app.inject({
      method: 'POST',
      url: `/lab/api/sessions/${session.id}/runs`,
      payload: { advancement: 'wait_all', roundSeconds: null, label: 'Run 1 — Baseline' }
    });
    expect(runRes.statusCode).toBe(200);
    const run = runRes.json();
    expect(run.benchmark).toBeDefined();

    // 3. Create teams
    const teamsRes = await app.inject({
      method: 'POST',
      url: `/lab/api/sessions/${session.id}/teams`,
      payload: { teamCount: 1, teamSize: 4, names: ['Global Supply Chain'] }
    });
    expect(teamsRes.statusCode).toBe(200);

    // 4. Human player joins as Retailer
    const joinRes = await app.inject({
      method: 'POST',
      url: '/lab/api/join',
      payload: { joinCode: session.join_code, displayName: 'Sarah (Retailer)' }
    });
    expect(joinRes.statusCode).toBe(200);
    const { playerToken } = joinRes.json();

    // 5. Start run
    const startRes = await app.inject({
      method: 'POST',
      url: `/lab/api/runs/${run.id}/start`
    });
    expect(startRes.statusCode).toBe(200);

    // 6. Play 3 consecutive weeks
    for (let w = 1; w <= 3; w++) {
      // Check state
      const stateRes = await app.inject({
        method: 'GET',
        url: '/lab/api/me/state',
        headers: { authorization: `Bearer ${playerToken}` }
      });
      expect(stateRes.statusCode).toBe(200);
      const state = stateRes.json();
      expect(state.week).toBe(w);
      expect(state.awaitingOrder).toBe(true);

      // Submit order
      const orderRes = await app.inject({
        method: 'POST',
        url: '/lab/api/me/order',
        headers: { authorization: `Bearer ${playerToken}` },
        payload: { week: w, quantity: 4, clientMsgId: `order-token-${w}` }
      });
      expect(orderRes.statusCode).toBe(200);
    }

    // 7. Verify Results endpoint (/lab/api/runs/:id/results)
    const resultsRes = await app.inject({
      method: 'GET',
      url: `/lab/api/runs/${run.id}/results`
    });
    expect(resultsRes.statusCode).toBe(200);
    const results = resultsRes.json();

    // Validate results payload contract (API.md §4)
    expect(results.run).toBeDefined();
    expect(results.run.id).toBe(run.id);
    expect(results.benchmark).toBeDefined();
    expect(results.benchmark.policy).toBe('base-stock');
    expect(results.benchmark.teamTotalCents).toBeGreaterThan(0);
    expect(results.demand.length).toBe(36);
    expect(results.teams.length).toBe(1);

    const teamResult = results.teams[0];
    expect(teamResult.name).toBe('Global Supply Chain');
    expect(teamResult.byEchelon.length).toBe(4);

    // Each echelon has weeks played
    for (const ech of teamResult.byEchelon) {
      expect(ech.weeks.length).toBe(3);
      expect(ech.totalCents).toBeGreaterThan(0);
      expect(ech.bullwhipRatio).toBeDefined();
      expect(ech.fillRate).toBeDefined();
    }

    // 8. Public read-only debrief (/r/:publishedId) redirects or returns results
    const publicDebriefRes = await app.inject({
      method: 'GET',
      url: `/lab/api/r/${run.id}`
    });
    expect([200, 302]).toContain(publicDebriefRes.statusCode);

    // 9. Facilitator stops the run
    const stopRes = await app.inject({
      method: 'POST',
      url: `/lab/api/runs/${run.id}/stop`
    });
    expect(stopRes.statusCode).toBe(200);

    // 10. Facilitator closes session
    const closeRes = await app.inject({
      method: 'PATCH',
      url: `/lab/api/sessions/${session.id}`,
      payload: { status: 'closed' }
    });
    expect(closeRes.statusCode).toBe(200);

    // Rejoin closed session returns 410
    const rejoinClosedRes = await app.inject({
      method: 'POST',
      url: '/lab/api/rejoin',
      payload: { playerToken }
    });
    expect(rejoinClosedRes.statusCode).toBe(410);
  });
});

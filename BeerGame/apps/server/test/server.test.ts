import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server.js';
import { FastifyInstance } from 'fastify';

describe('Beer Game Server API & Invariants', () => {
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

  it('1. Create session, runs, teams, and join flow', async () => {
    // Facilitator creates session
    const sessRes = await app.inject({
      method: 'POST',
      url: '/lab/api/sessions',
      payload: { title: 'Executive Seminar Beer Game' }
    });
    expect(sessRes.statusCode).toBe(200);
    const session = sessRes.json();
    expect(session.join_code).toBeDefined();
    expect(session.join_code.length).toBe(4);

    // Facilitator creates Run 1
    const runRes = await app.inject({
      method: 'POST',
      url: `/lab/api/sessions/${session.id}/runs`,
      payload: { advancement: 'wait_all', roundSeconds: null, label: 'Run 1 — Baseline' }
    });
    expect(runRes.statusCode).toBe(200);
    const run = runRes.json();
    expect(run.weeks_planned).toBe(36);
    expect(run.benchmark).toBeDefined();

    // Facilitator creates 1 team with 4 seats
    const teamsRes = await app.inject({
      method: 'POST',
      url: `/lab/api/sessions/${session.id}/teams`,
      payload: { teamCount: 1, teamSize: 4, names: ['Alpha Team'] }
    });
    expect(teamsRes.statusCode).toBe(200);

    // Player joins
    const joinRes = await app.inject({
      method: 'POST',
      url: '/lab/api/join',
      payload: { joinCode: session.join_code, displayName: 'Alice' }
    });
    expect(joinRes.statusCode).toBe(200);
    const joinData = joinRes.json();
    expect(joinData.playerToken).toBeDefined();
    expect(joinData.echelon).toBe(0); // Retailer

    // Player rejoins
    const rejoinRes = await app.inject({
      method: 'POST',
      url: '/lab/api/rejoin',
      payload: { playerToken: joinData.playerToken }
    });
    expect(rejoinRes.statusCode).toBe(200);
    expect(rejoinRes.json().seatId).toBe(joinData.seatId);
  });

  it('2. Information isolation: Player state contains ZERO data from other echelons', async () => {
    // Create new session & join player as Retailer (0)
    const sessRes = await app.inject({
      method: 'POST',
      url: '/lab/api/sessions',
      payload: { title: 'Isolation Test Session' }
    });
    const session = sessRes.json();

    const runRes = await app.inject({
      method: 'POST',
      url: `/lab/api/sessions/${session.id}/runs`,
      payload: { advancement: 'wait_all', roundSeconds: null }
    });
    const run = runRes.json();

    await app.inject({
      method: 'POST',
      url: `/lab/api/sessions/${session.id}/teams`,
      payload: { teamCount: 1, teamSize: 4 }
    });

    const joinRes = await app.inject({
      method: 'POST',
      url: '/lab/api/join',
      payload: { joinCode: session.join_code, displayName: 'Bob' }
    });
    const { playerToken } = joinRes.json();

    // Start run
    await app.inject({
      method: 'POST',
      url: `/lab/api/runs/${run.id}/start`
    });

    // Fetch player state
    const stateRes = await app.inject({
      method: 'GET',
      url: '/lab/api/me/state',
      headers: { authorization: `Bearer ${playerToken}` }
    });
    expect(stateRes.statusCode).toBe(200);
    const state = stateRes.json();

    // Verify own state exists
    expect(state.week).toBe(1);
    expect(state.inventory).toBeDefined();
    expect(state.backlog).toBeDefined();
    expect(state.incomingOrder).toBeDefined();
    expect(state.pipeline).toBeDefined();
    expect(state.role).toBe('Retailer');

    // CRITICAL INVARIANT: ZERO foreign echelon data
    expect(state).not.toHaveProperty('wholesaler');
    expect(state).not.toHaveProperty('distributor');
    expect(state).not.toHaveProperty('factory');
    expect(state).not.toHaveProperty('otherEchelons');
    expect(state).not.toHaveProperty('allInventory');
    expect(state).not.toHaveProperty('echelons');
    expect(state).not.toHaveProperty('endCustomerDemand'); // informationSharing is false
  });

  it('3. Idempotency: Duplicate submit_order with same clientMsgId is acknowledged and not duplicated', async () => {
    const sessRes = await app.inject({
      method: 'POST',
      url: '/lab/api/sessions',
      payload: { title: 'Idempotency Session' }
    });
    const session = sessRes.json();

    const runRes = await app.inject({
      method: 'POST',
      url: `/lab/api/sessions/${session.id}/runs`,
      payload: { advancement: 'wait_all' }
    });
    const run = runRes.json();

    await app.inject({
      method: 'POST',
      url: `/lab/api/sessions/${session.id}/teams`,
      payload: { teamCount: 1, teamSize: 4 }
    });

    const joinRes = await app.inject({
      method: 'POST',
      url: '/lab/api/join',
      payload: { joinCode: session.join_code, displayName: 'Charlie' }
    });
    const { playerToken } = joinRes.json();

    await app.inject({
      method: 'POST',
      url: `/lab/api/runs/${run.id}/start`
    });

    // First submit with clientMsgId
    const firstSubmit = await app.inject({
      method: 'POST',
      url: '/lab/api/me/order',
      headers: { authorization: `Bearer ${playerToken}` },
      payload: { week: 1, quantity: 5, clientMsgId: 'msg-uuid-12345' }
    });
    expect(firstSubmit.statusCode).toBe(200);

    // Second submit with same clientMsgId (e.g. double tap on phone screen)
    const duplicateSubmit = await app.inject({
      method: 'POST',
      url: '/lab/api/me/order',
      headers: { authorization: `Bearer ${playerToken}` },
      payload: { week: 1, quantity: 5, clientMsgId: 'msg-uuid-12345' }
    });
    expect(duplicateSubmit.statusCode).toBe(200);
    expect(duplicateSubmit.json().duplicate).toBe(true);
  });
});

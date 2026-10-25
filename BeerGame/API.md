# API contract — normative

Base path `/lab/api`. WebSocket at `/lab/ws`. All bodies JSON, all boundaries validated
with Zod. Times are ISO 8601 UTC. Money is integer cents.

Two identities:

- **Facilitator / observer** — qumni account, session cookie, standard auth.
- **Player** — anonymous. A join returns a `playerToken` (opaque, 32 bytes base64url)
  stored in `localStorage` and bound to one seat. Never an account, never an email.

---

## 1. REST

### Facilitator

| Method | Path | Body / notes |
|---|---|---|
| `POST` | `/sessions` | `{ title, scenarioId }` → session with `joinCode` |
| `GET` | `/sessions/:id` | Session, runs, teams, seat occupancy |
| `PATCH` | `/sessions/:id` | `{ status: 'lobby' \| 'closed' }` |
| `POST` | `/sessions/:id/teams` | `{ mode: 'random' \| 'manual', teamSize, names? }` |
| `POST` | `/sessions/:id/runs` | `{ scenarioId, advancement, roundSeconds, label }` → creates run, runs the benchmark shadow sim |
| `POST` | `/runs/:id/start` | |
| `POST` | `/runs/:id/stop` | Ends early; results stay complete and valid |
| `POST` | `/runs/:id/pause` · `/resume` | |
| `POST` | `/teams/:id/advance` | Force-advance one team |
| `POST` | `/seats/:id/bot` | `{ policy, params }` — substitute a bot |
| `POST` | `/seats/:id/assign` | `{ playerId }` — reassign a player |
| `GET` | `/runs/:id/results` | Full result set (see §4) |
| `GET` | `/runs/:id/export?format=csv\|xlsx` | |
| `GET`/`POST`/`PUT` | `/scenarios` | CRUD + templates |
| `POST` | `/scenarios/preview` | Runs the engine with base-stock bots, returns series. No persistence. |

### Player

| Method | Path | Body / notes |
|---|---|---|
| `POST` | `/join` | `{ joinCode, displayName }` → `{ playerToken, seatId, teamId, runId }` |
| `POST` | `/rejoin` | `{ playerToken }` → same, or `410` if the session is closed |
| `GET` | `/me/state` | Same payload as the WS `state` message; the polling fallback |
| `POST` | `/me/order` | Fallback for `submit_order` when WS is unavailable |
| `POST` | `/me/utterance` | `{ promptId, kind, body, week? }` |
| `POST` | `/me/prediction` | `{ scope: 'run' \| 'experiment', statement }` |

### Public

| Method | Path |
|---|---|
| `GET` | `/r/:publishedId` — read-only debrief payload |

---

## 2. WebSocket

Connect with `?token=<playerToken>` or an authenticated facilitator cookie. Every message
is `{ "type": string, "payload": object }`.

### Server → player

| Type | Payload |
|---|---|
| `state` | `{ week, revealedEndWeek, inventory, backlog, incomingOrder, pipeline[], costCentsThisWeek, cumCostCents, history[], deadlineAt, awaitingOrder, role, teamName }` |
| `round_opened` | `{ week, deadlineAt }` |
| `round_closed` | `{ week, arrived, shipped, inventory, backlog, weekCostCents, filledByBot }` |
| `prompt` | `{ promptId, kind, question, fields[] }` |
| `run_ended` | `{ weeksPlayed, ownCumCostCents, debriefUrl? }` |
| `notice` | `{ level, text }` — facilitator message, bot substitution, pause |
| `error` | `{ code, message, currentWeek? }` |

The `state` payload is **built per seat** and contains no other echelon's figures unless
`scenario.informationSharing` is true, in which case it gains `endCustomerDemand` and
nothing else. Enforce in the serialiser. Write a test that asserts a player payload
contains no foreign echelon data.

### Player → server

| Type | Payload |
|---|---|
| `submit_order` | `{ week, quantity, clientMsgId }` |
| `submit_utterance` | `{ promptId, kind, body, clientMsgId }` |
| `heartbeat` | `{}` — refreshes `last_seen_at` so the host grid can show who went quiet |

### Server → facilitator

| Type | Payload |
|---|---|
| `dashboard` | Compact delta: per team `{ teamId, week, seatsHuman, seatsBot, pendingSeats, cumCostCents, lastSubmitAt }` |
| `session_event` | `{ type, teamId?, seatId?, at, detail }` |

**Throttle `dashboard` to at most one message per second in aggregate**, coalescing all
team deltas into it. Per-event fan-out is what makes a 40-team dashboard stutter.

---

## 3. Server rules

1. **Idempotency.** `submit_order` carries `clientMsgId`. A repeat for the same seat and
   week is acknowledged, not applied twice. Double-tap is the most common client bug and it
   destroys a team's run.
2. **Week guard.** An order tagged with a stale week is rejected with
   `error { code: 'stale_week', currentWeek }`. Never silently applied to the new week.
3. **Authority on timing.** `deadlineAt` is a server timestamp. The client counts down
   against it; the server alone decides when a round closes.
4. **Round close.** On deadline (mode `timer`) or last submission (mode `wait_all`):
   fill missing orders from each seat's bot, call `advanceWeek`, **persist decisions and
   `week_state` rows in one transaction, then** broadcast `round_closed` and the next
   `round_opened`.
5. **Ordering.** A team's rounds advance strictly sequentially. Serialise per team — one
   in-process lock per team id is enough at this scale.
6. **Late join.** A player joining an in-progress run takes over a bot seat, inherits its
   history, and receives a `notice` saying which weeks a bot played.
7. **Reconnect.** A valid `playerToken` restores the seat in any run state.
8. **Crash recovery.** On boot, rebuild in-memory room state from `week_state` and
   `decision`. Nothing authoritative may exist only in memory.

---

## 4. Results payload

```jsonc
{
  "run": { "id": "...", "label": "Run 1 — silent", "weeksPlayed": 36, "engineVersion": "1.0.0" },
  "benchmark": { "policy": "base-stock", "teamTotalCents": 0, "series": [] },
  "teams": [{
    "id": "...", "name": "Team 3",
    "totalCents": 0,
    "byEchelon": [{
      "echelon": 0,
      "totalCents": 0, "holdCents": 0, "backCents": 0,
      "bullwhipRatio": 0.0, "stageAmplification": 0.0, "inventoryVarianceRatio": 0.0,
      "peakToTrough": 0, "serviceLevel": 0.0, "fillRate": 0.0,
      "weeks": [{ "week": 1, "inventory": 12, "backlog": 0, "incomingOrder": 4,
                  "shipped": 4, "orderPlaced": 4, "pipeline": [4,4],
                  "weekCostCents": 600, "cumCostCents": 600, "latencyMs": 4210,
                  "filledByBot": false }]
    }],
    "predictions": [], "utterances": []
  }],
  "demand": [4,4,4,4,8]
}
```

`GET /runs/:id/results` is the single source for the debrief UI and both exports. Do not
build a second aggregation path.

---

## 5. Errors

`{ "error": { "code": "...", "message": "..." } }` with the matching HTTP status.

| Code | Status | When |
|---|---|---|
| `invalid_join_code` | 404 | |
| `session_closed` | 410 | |
| `seat_taken` | 409 | |
| `stale_week` | 409 | Order for a week that has closed |
| `not_awaiting_order` | 409 | Already submitted this week |
| `invalid_order` | 400 | Non-integer, or above `maxOrder` |
| `run_not_running` | 409 | |
| `forbidden` | 403 | Facilitator action without the session |

Rate-limit `/join` and `submit_order` per token. A player cannot submit more than once per
week anyway, so the limit is abuse protection, not flow control.

# Working rules for this repo

Qumni Lab — a Learning Organization platform at `qumni.com/lab`. First experience: the MIT
Beer Distribution Game.

Read `SPEC.md` first. `docs/ENGINE.md`, `docs/API.md` and `db/schema.sql` are normative —
if code and those files disagree, the files are right and the code is a bug.

## Order of work

1. `packages/engine` and its golden tests. **Do not start any UI, server or schema work
   until every golden test in `docs/ENGINE.md` §8 passes.** An engine bug found after the
   UI exists is expensive to unpick, and every number the product shows depends on it.
2. Schema and repo layer.
3. Server: sessions, join, WS loop, round advancement, persistence.
4. Player UI, then host console, then debrief.
5. Prediction and reflection capture.
6. Second run and cross-run comparison.

## Rules that are not negotiable

- **The engine is pure.** No I/O, no `Date.now()`, no `Math.random()`, no logging, no
  dependencies in `packages/engine`. Randomness comes from a seeded PRNG in the state.
- **Persist before acknowledging.** Decisions and `week_state` rows are written in one
  transaction before any `round_closed` goes out. Nothing authoritative lives only in
  memory. On boot, rebuild room state from the database.
- **The server owns state.** The client renders what it is sent. If you find yourself
  computing inventory in React, stop.
- **Information isolation is server-side.** A player's payload is built per seat and
  contains no other echelon's data. There is a test for this; keep it passing.
- **Idempotency on every mutating message.** `clientMsgId` on `submit_order`. Double-tap
  is the most common client bug in this genre.
- **Integers everywhere.** Money in cents, quantities as integers. No floats in state.
- **Rounding is half away from zero.** Anywhere a value is rounded.
- **Stamp `engineVersion` on every run.** Never silently re-score an old run under new rules.

## Conventions

- TypeScript strict. No `any`. No non-null assertions outside tests.
- Zod schema at every boundary: HTTP body, WS message, scenario JSON, env vars.
- Kysely for SQL. No ORM relations, no lazy loading, no query builders hidden behind
  repositories that return entities.
- Migrations are numbered `.sql` files applied in order. Never edit an applied migration.
- One in-process lock per team id serialises round advancement. That is enough at this scale.
- Errors: `{ error: { code, message } }`, codes as listed in `docs/API.md` §5.

## Definition of done for a slice

- Types and Zod validation at the boundary.
- Unit tests for logic; one integration test per endpoint or WS message type.
- Nothing authoritative in memory only.
- Checked at a 390px viewport. Players use phones.

## Things to push back on

If a task would require any of these, say so rather than doing it:

- Caching game state in Redis or in module scope "for speed" — the write rate is about
  3/second.
- Sending the full game state to every client and filtering in the UI.
- Computing debrief metrics in a second code path instead of from `/runs/:id/results`.
- Adding an ORM, a message queue, or a second database.
- Hardcoding a benchmark cost number that has not actually been computed by the engine.

## Out of scope for this build

AI coach, organizational-memory browser, white-label theming, public leaderboards, PDF
export, localisation, LMS/LTI integration, concurrency beyond 150 players. These are real
plans for later; they are not this build, and adding them early starves the learning loop
that the product is actually testing.

## Glossary

- **Echelon** — a position in the chain. 0 = retailer, n−1 = factory.
- **Seat** — a position in a team, held by a human or a bot. The holder changes; the seat
  and its history do not.
- **Supply line** — everything ordered but not yet received. Sterman's finding is that
  people systematically under-weight it; the debrief makes this visible.
- **Run vs experiment** — run 1 is the baseline, run 2 is an experiment with a stored
  prediction attached. The prediction is what makes it an experiment rather than a repeat.
- **Bullwhip ratio** — `Var(orders) / Var(demand)`. 1.0 is pass-through, above 1 is
  amplification.

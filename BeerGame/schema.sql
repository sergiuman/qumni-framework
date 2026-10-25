-- Qumni Lab — schema. Source of truth for the data model.
-- PostgreSQL 16. All money in integer cents. All ids uuid v7 where possible.
-- Split in two layers: GAME (phase 0-1) and PLATFORM (phase 2+).
-- Do not store derived aggregates as the source of truth: everything in the analysis
-- module is computed from week_state and decision.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================ PLATFORM (minimal in this build)

CREATE TABLE organization (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_user (                       -- facilitators and observers only
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES organization(id) ON DELETE SET NULL,
  email       citext UNIQUE,
  name        text NOT NULL,
  role        text NOT NULL CHECK (role IN ('facilitator','observer','admin')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE learning_experience (            -- the Beer Game is one row here
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES organization(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('beer_game','case','retro','field')),
  title       text NOT NULL,
  module_ref  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================ GAME

CREATE TABLE scenario (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid REFERENCES app_user(id) ON DELETE SET NULL,
  org_id          uuid REFERENCES organization(id) ON DELETE CASCADE,
  name            text NOT NULL,
  is_template     boolean NOT NULL DEFAULT false,
  params          jsonb NOT NULL,             -- the Scenario object; schema-versioned
  params_version  int NOT NULL DEFAULT 1,
  engine_version  text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE session (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facilitator_id  uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  experience_id   uuid REFERENCES learning_experience(id) ON DELETE SET NULL,
  title           text NOT NULL,
  join_code       text NOT NULL UNIQUE,       -- short, typable, no ambiguous glyphs
  status          text NOT NULL CHECK (status IN ('draft','lobby','running','finished','closed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz
);
CREATE INDEX ON session (facilitator_id, created_at DESC);

CREATE TABLE player (                         -- anonymous: no email, no account
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  display_name  text NOT NULL,
  token_hash    text NOT NULL,                -- sha256 of the playerToken; never store the token
  joined_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON player (token_hash);
CREATE INDEX ON player (session_id);

CREATE TABLE run (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  scenario_id       uuid NOT NULL REFERENCES scenario(id) ON DELETE RESTRICT,
  idx               int NOT NULL,             -- 1 = run 1, 2 = experiment 2
  label             text NOT NULL,
  status            text NOT NULL CHECK (status IN ('pending','running','paused','finished','aborted')),
  advancement       text NOT NULL CHECK (advancement IN ('timer','wait_all','async')),
  round_seconds     int,
  weeks_planned     int NOT NULL,
  weeks_played      int NOT NULL DEFAULT 0,
  rng_seed          bigint NOT NULL,
  engine_version    text NOT NULL,
  benchmark         jsonb,                    -- shadow base-stock sim, computed at creation
  started_at        timestamptz,
  ended_at          timestamptz,
  UNIQUE (session_id, idx)
);

CREATE TABLE team (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES session(id) ON DELETE CASCADE,  -- teams persist across runs
  run_id        uuid NOT NULL REFERENCES run(id) ON DELETE CASCADE,
  name          text NOT NULL,
  current_week  int NOT NULL DEFAULT 0,
  status        text NOT NULL CHECK (status IN ('waiting','running','finished')),
  deadline_at   timestamptz
);
CREATE INDEX ON team (run_id);

CREATE TABLE seat (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  echelon       int NOT NULL CHECK (echelon BETWEEN 0 AND 5),
  holder_type   text NOT NULL CHECK (holder_type IN ('human','bot')),
  bot_policy    text CHECK (bot_policy IN ('naive','base-stock','sterman','scripted')),
  bot_params    jsonb,
  bot_memory    jsonb NOT NULL DEFAULT '{}'::jsonb,
  player_id     uuid REFERENCES player(id) ON DELETE SET NULL,
  UNIQUE (team_id, echelon),
  CHECK ((holder_type = 'bot' AND bot_policy IS NOT NULL) OR holder_type = 'human')
);
CREATE INDEX ON seat (player_id);

CREATE TABLE decision (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_id       uuid NOT NULL REFERENCES seat(id) ON DELETE CASCADE,
  week          int NOT NULL,
  quantity      int NOT NULL CHECK (quantity >= 0),
  submitted_by  text NOT NULL CHECK (submitted_by IN ('human','bot','facilitator')),
  client_msg_id text,                         -- idempotency
  latency_ms    int,                          -- from round_opened to submit; a real debrief signal
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seat_id, week)
);
CREATE UNIQUE INDEX ON decision (seat_id, client_msg_id) WHERE client_msg_id IS NOT NULL;

-- The append-only fact table. Everything in the analysis module derives from this.
CREATE TABLE week_state (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           uuid NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  echelon           int NOT NULL,
  week              int NOT NULL,
  inventory         int NOT NULL,
  backlog           int NOT NULL,
  incoming_order    int NOT NULL,
  shipped           int NOT NULL,
  order_placed      int NOT NULL,
  pipeline          int[] NOT NULL,           -- the supply line the player could not see
  week_cost_cents   int NOT NULL,
  cum_cost_cents    int NOT NULL,
  filled_by_bot     boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, echelon, week),
  CHECK (NOT (inventory > 0 AND backlog > 0))
);
CREATE INDEX ON week_state (team_id, week);

CREATE TABLE session_event (                  -- audit log; without it you cannot explain a weird team
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  run_id      uuid REFERENCES run(id) ON DELETE CASCADE,
  team_id     uuid REFERENCES team(id) ON DELETE CASCADE,
  seat_id     uuid REFERENCES seat(id) ON DELETE CASCADE,
  type        text NOT NULL,                  -- join, disconnect, bot_substitute, pause, force_advance, message, stop
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON session_event (session_id, at DESC);

-- ============================================================ LEARNING LAYER (phase 2)

CREATE TABLE experiment (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id     uuid REFERENCES learning_experience(id) ON DELETE CASCADE,
  run_id            uuid REFERENCES run(id) ON DELETE CASCADE,
  idx               int NOT NULL,
  question          text NOT NULL,            -- "what changes if we share POS demand?"
  changed_variable  text,
  status            text NOT NULL CHECK (status IN ('planned','running','concluded'))
);

CREATE TABLE prediction (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id     uuid REFERENCES experiment(id) ON DELETE CASCADE,
  run_id            uuid REFERENCES run(id) ON DELETE CASCADE,
  subject_type      text NOT NULL CHECK (subject_type IN ('player','team')),
  subject_id        uuid NOT NULL,
  statement         text NOT NULL,
  predicted_direction text CHECK (predicted_direction IN ('up','down','same','unsure')),
  made_at           timestamptz NOT NULL DEFAULT now(),
  resolved_outcome  text,
  accuracy          numeric(4,3)
);

CREATE TABLE utterance (                      -- beliefs, reflections, stated mental models
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid REFERENCES run(id) ON DELETE CASCADE,
  seat_id       uuid REFERENCES seat(id) ON DELETE CASCADE,
  week          int,
  kind          text NOT NULL CHECK (kind IN ('belief','reflection','mental_model')),
  prompt_id     text NOT NULL,
  body          text NOT NULL,
  visibility    text NOT NULL DEFAULT 'facilitator'
                  CHECK (visibility IN ('private','facilitator','org')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON utterance (run_id, week);
-- utterance.body is free text and will contain opinions about colleagues.
-- Treat as personal data: facilitator-visible by default, org-visible on opt-in,
-- always excluded from an export marked anonymised.

CREATE TABLE insight (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid REFERENCES run(id) ON DELETE SET NULL,
  org_id        uuid REFERENCES organization(id) ON DELETE CASCADE,
  statement     text NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE intervention (                   -- the bridge to the real organization
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  insight_id          uuid REFERENCES insight(id) ON DELETE SET NULL,
  real_world_analogue text NOT NULL,
  description         text NOT NULL,
  measure             text NOT NULL,
  baseline            text,
  result              text,
  status              text NOT NULL CHECK (status IN ('proposed','running','measured','dropped')),
  measured_at         timestamptz
);

-- learning_cycle is intentionally a VIEW, not a table: prediction → decision → week_state
-- → utterance → insight → intervention for one subject and one experience. Keeping it a
-- view is what lets a non-game experience join the same loop later.

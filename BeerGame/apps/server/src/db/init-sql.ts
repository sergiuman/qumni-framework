/**
 * SQL DDL statements for initializing SQLite database.
 */
export const SQLITE_INIT_DDL = `
CREATE TABLE IF NOT EXISTS organization (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_user (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES organization(id) ON DELETE SET NULL,
  email TEXT UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('facilitator','observer','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS learning_experience (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES organization(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('beer_game','case','retro','field')),
  title TEXT NOT NULL,
  module_ref TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scenario (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES app_user(id) ON DELETE SET NULL,
  org_id TEXT REFERENCES organization(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_template INTEGER NOT NULL DEFAULT 0,
  params TEXT NOT NULL,
  params_version INTEGER NOT NULL DEFAULT 1,
  engine_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  facilitator_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  experience_id TEXT REFERENCES learning_experience(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  join_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('draft','lobby','running','finished','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_session_fac ON session (facilitator_id, created_at DESC);

CREATE TABLE IF NOT EXISTS player (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_player_sess ON player (session_id);

CREATE TABLE IF NOT EXISTS run (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  scenario_id TEXT NOT NULL REFERENCES scenario(id) ON DELETE RESTRICT,
  idx INTEGER NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','running','paused','finished','aborted')),
  advancement TEXT NOT NULL CHECK (advancement IN ('timer','wait_all','async')),
  round_seconds INTEGER,
  weeks_planned INTEGER NOT NULL,
  weeks_played INTEGER NOT NULL DEFAULT 0,
  rng_seed INTEGER NOT NULL,
  engine_version TEXT NOT NULL,
  benchmark TEXT,
  started_at TEXT,
  ended_at TEXT,
  UNIQUE (session_id, idx)
);

CREATE TABLE IF NOT EXISTS team (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  current_week INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('waiting','running','finished')),
  deadline_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_team_run ON team (run_id);

CREATE TABLE IF NOT EXISTS seat (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  echelon INTEGER NOT NULL CHECK (echelon BETWEEN 0 AND 5),
  holder_type TEXT NOT NULL CHECK (holder_type IN ('human','bot')),
  bot_policy TEXT CHECK (bot_policy IN ('naive','base-stock','sterman','scripted')),
  bot_params TEXT,
  bot_memory TEXT NOT NULL DEFAULT '{}',
  player_id TEXT REFERENCES player(id) ON DELETE SET NULL,
  UNIQUE (team_id, echelon)
);
CREATE INDEX IF NOT EXISTS idx_seat_player ON seat (player_id);

CREATE TABLE IF NOT EXISTS decision (
  id TEXT PRIMARY KEY,
  seat_id TEXT NOT NULL REFERENCES seat(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  submitted_by TEXT NOT NULL CHECK (submitted_by IN ('human','bot','facilitator')),
  client_msg_id TEXT,
  latency_ms INTEGER,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (seat_id, week)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_decision_idemp ON decision (seat_id, client_msg_id) WHERE client_msg_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS week_state (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  echelon INTEGER NOT NULL,
  week INTEGER NOT NULL,
  inventory INTEGER NOT NULL,
  backlog INTEGER NOT NULL,
  incoming_order INTEGER NOT NULL,
  shipped INTEGER NOT NULL,
  order_placed INTEGER NOT NULL,
  pipeline TEXT NOT NULL,
  week_cost_cents INTEGER NOT NULL,
  cum_cost_cents INTEGER NOT NULL,
  filled_by_bot INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (team_id, echelon, week),
  CHECK (NOT (inventory > 0 AND backlog > 0))
);
CREATE INDEX IF NOT EXISTS idx_week_state_team_week ON week_state (team_id, week);

CREATE TABLE IF NOT EXISTS session_event (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES run(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES team(id) ON DELETE CASCADE,
  seat_id TEXT REFERENCES seat(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_session_event ON session_event (session_id, at DESC);

CREATE TABLE IF NOT EXISTS experiment (
  id TEXT PRIMARY KEY,
  experience_id TEXT REFERENCES learning_experience(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES run(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  question TEXT NOT NULL,
  changed_variable TEXT,
  status TEXT NOT NULL CHECK (status IN ('planned','running','concluded'))
);

CREATE TABLE IF NOT EXISTS prediction (
  id TEXT PRIMARY KEY,
  experiment_id TEXT REFERENCES experiment(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES run(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('player','team')),
  subject_id TEXT NOT NULL,
  statement TEXT NOT NULL,
  predicted_direction TEXT CHECK (predicted_direction IN ('up','down','same','unsure')),
  made_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_outcome TEXT,
  accuracy REAL
);

CREATE TABLE IF NOT EXISTS utterance (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES run(id) ON DELETE CASCADE,
  seat_id TEXT REFERENCES seat(id) ON DELETE CASCADE,
  week INTEGER,
  kind TEXT NOT NULL CHECK (kind IN ('belief','reflection','mental_model')),
  prompt_id TEXT NOT NULL,
  body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'facilitator' CHECK (visibility IN ('private','facilitator','org')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_utterance ON utterance (run_id, week);

CREATE TABLE IF NOT EXISTS insight (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES run(id) ON DELETE SET NULL,
  org_id TEXT REFERENCES organization(id) ON DELETE CASCADE,
  statement TEXT NOT NULL,
  evidence_refs TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS intervention (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  insight_id TEXT REFERENCES insight(id) ON DELETE SET NULL,
  real_world_analogue TEXT NOT NULL,
  description TEXT NOT NULL,
  measure TEXT NOT NULL,
  baseline TEXT,
  result TEXT,
  status TEXT NOT NULL CHECK (status IN ('proposed','running','measured','dropped')),
  measured_at TEXT
);
`;

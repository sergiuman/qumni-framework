import { Generated } from 'kysely';

export interface OrganizationTable {
  id: string;
  name: string;
  settings: string;
  created_at: string;
}

export interface AppUserTable {
  id: string;
  org_id: string | null;
  email: string | null;
  name: string;
  role: 'facilitator' | 'observer' | 'admin';
  created_at: string;
}

export interface LearningExperienceTable {
  id: string;
  org_id: string | null;
  kind: 'beer_game' | 'case' | 'retro' | 'field';
  title: string;
  module_ref: string;
  created_at: string;
}

export interface ScenarioTable {
  id: string;
  owner_id: string | null;
  org_id: string | null;
  name: string;
  is_template: number; // 0 or 1
  params: string; // JSON stringified Scenario
  params_version: number;
  engine_version: string;
  created_at: string;
}

export interface SessionTable {
  id: string;
  facilitator_id: string;
  experience_id: string | null;
  title: string;
  join_code: string;
  status: 'draft' | 'lobby' | 'running' | 'finished' | 'closed';
  created_at: string;
  closed_at: string | null;
}

export interface PlayerTable {
  id: string;
  session_id: string;
  display_name: string;
  token_hash: string;
  joined_at: string;
  last_seen_at: string;
}

export interface RunTable {
  id: string;
  session_id: string;
  scenario_id: string;
  idx: number; // 1 or 2
  label: string;
  status: 'pending' | 'running' | 'paused' | 'finished' | 'aborted';
  advancement: 'timer' | 'wait_all' | 'async';
  round_seconds: number | null;
  weeks_planned: number;
  weeks_played: number;
  rng_seed: number;
  engine_version: string;
  benchmark: string | null; // JSON stringified benchmark
  started_at: string | null;
  ended_at: string | null;
}

export interface TeamTable {
  id: string;
  session_id: string;
  run_id: string;
  name: string;
  current_week: number;
  status: 'waiting' | 'running' | 'finished';
  deadline_at: string | null;
}

export interface SeatTable {
  id: string;
  team_id: string;
  echelon: number; // 0 to 3 (or 5)
  holder_type: 'human' | 'bot';
  bot_policy: 'naive' | 'base-stock' | 'sterman' | 'scripted' | null;
  bot_params: string | null; // JSON
  bot_memory: string; // JSON
  player_id: string | null;
}

export interface DecisionTable {
  id: string;
  seat_id: string;
  week: number;
  quantity: number;
  submitted_by: 'human' | 'bot' | 'facilitator';
  client_msg_id: string | null;
  latency_ms: number | null;
  submitted_at: string;
}

export interface WeekStateTable {
  id: string;
  team_id: string;
  echelon: number;
  week: number;
  inventory: number;
  backlog: number;
  incoming_order: number;
  shipped: number;
  order_placed: number;
  pipeline: string; // JSON stringified array of numbers: e.g. "[4, 4]"
  week_cost_cents: number;
  cum_cost_cents: number;
  filled_by_bot: number; // 0 or 1
  created_at: string;
}

export interface SessionEventTable {
  id: string;
  session_id: string;
  run_id: string | null;
  team_id: string | null;
  seat_id: string | null;
  type: string;
  payload: string; // JSON
  at: string;
}

export interface ExperimentTable {
  id: string;
  experience_id: string | null;
  run_id: string | null;
  idx: number;
  question: string;
  changed_variable: string | null;
  status: 'planned' | 'running' | 'concluded';
}

export interface PredictionTable {
  id: string;
  experiment_id: string | null;
  run_id: string | null;
  subject_type: 'player' | 'team';
  subject_id: string;
  statement: string;
  predicted_direction: 'up' | 'down' | 'same' | 'unsure' | null;
  made_at: string;
  resolved_outcome: string | null;
  accuracy: number | null;
}

export interface UtteranceTable {
  id: string;
  run_id: string | null;
  seat_id: string | null;
  week: number | null;
  kind: 'belief' | 'reflection' | 'mental_model';
  prompt_id: string;
  body: string;
  visibility: 'private' | 'facilitator' | 'org';
  created_at: string;
}

export interface InsightTable {
  id: string;
  run_id: string | null;
  org_id: string | null;
  statement: string;
  evidence_refs: string; // JSON
  created_at: string;
}

export interface InterventionTable {
  id: string;
  org_id: string | null;
  insight_id: string | null;
  real_world_analogue: string;
  description: string;
  measure: string;
  baseline: string | null;
  result: string | null;
  status: 'proposed' | 'running' | 'measured' | 'dropped';
  measured_at: string | null;
}

export interface Database {
  organization: OrganizationTable;
  app_user: AppUserTable;
  learning_experience: LearningExperienceTable;
  scenario: ScenarioTable;
  session: SessionTable;
  player: PlayerTable;
  run: RunTable;
  team: TeamTable;
  seat: SeatTable;
  decision: DecisionTable;
  week_state: WeekStateTable;
  session_event: SessionEventTable;
  experiment: ExperimentTable;
  prediction: PredictionTable;
  utterance: UtteranceTable;
  insight: InsightTable;
  intervention: InterventionTable;
}

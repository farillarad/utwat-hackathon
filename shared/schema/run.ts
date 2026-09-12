export type LevelOutcome =
  | "completed"
  | "stuck_in_loop"
  | "fell_for_distractor"
  | "assumed_success_incorrectly"
  | "hijacked_by_injection";

export interface LevelResult {
  level: number;
  outcome: LevelOutcome;
  failure_mode: LevelOutcome | null;
  duration_s: number;
  retries?: number;
}

export interface RunRecord {
  run_id: string;
  agent_name: string;
  start_url: string;
  started_at: number;
  levels: LevelResult[];
}

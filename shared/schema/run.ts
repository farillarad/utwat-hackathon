export type LevelOutcome =
  | "completed"
  | "stuck_in_loop"
  | "fell_for_distractor"
  | "assumed_success_incorrectly"
  | "hijacked_by_injection";

export interface LevelResult {
  level: number;
  outcome: "completed" | "failed"; // ground truth (PRD §7)
  failure_mode: LevelOutcome | null; // classifier label, null if completed
  duration_s: number;
  retries: number; // attempts before this result
}

export interface RunRecord {
  run_id: string;
  agent_name: string;
  start_url: string;
  started_at: number;
  levels: LevelResult[];
}

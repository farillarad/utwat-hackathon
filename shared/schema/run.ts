export type LevelOutcome =
  | "completed"
  | "stuck_in_loop"
  | "fell_for_distractor"
  | "assumed_success_incorrectly"
  | "hijacked_by_injection";

export interface LevelResult {
  level: number;
  outcome: "completed" | "failed"; // ground truth, per PRD §7 — decoupled from the classifier label
  failure_mode: LevelOutcome | null;
  duration_s: number;
  retries?: number;
  // Did the agent itself believe it succeeded? null until the agent reports (or
  // never reports) its own belief. Comparing this to `outcome` is what makes the
  // Level 5 "assumed success incorrectly" story visible on the scoreboard instead
  // of just asserted in the pitch.
  agent_self_report?: boolean | null;
}

export interface RunRecord {
  run_id: string;
  agent_name: string;
  start_url: string;
  started_at: number;
  levels: LevelResult[];
}

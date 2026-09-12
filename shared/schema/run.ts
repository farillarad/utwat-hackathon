export const FAILURE_MODES = [
  "stuck_in_loop",
  "fell_for_distractor",
  "assumed_success_incorrectly",
  "hijacked_by_injection",
] as const;

export type FailureMode = (typeof FAILURE_MODES)[number];

// run_id the gauntlet's eventLogger falls back to when the page has no ?run_id=
// (i.e. a human clicking through for acceptance testing). The server auto-creates
// this run so manual tests still produce real ground-truth results.
export const MANUAL_RUN_ID = "manual-test-run";

// OrderPayload lives in ./order; re-exported here so either import path works.
export type { OrderPayload } from "./order";

export interface LevelResult {
  level: number;
  outcome: "completed" | "failed"; // ground truth
  failure_mode: FailureMode | null; // classifier label, null if completed
  duration_s: number;
  retries: number; // attempts before this result
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

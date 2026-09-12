export const FAILURE_MODES = [
  "stuck_in_loop",
  "fell_for_distractor",
  "assumed_success_incorrectly",
  "hijacked_by_injection",
] as const;

export type FailureMode = (typeof FAILURE_MODES)[number];

// Posted from CheckoutForm to the server. Fields beyond item/quantity are only
// populated once Levels 3/5/6 wire them up in the form; ground truth already
// accounts for them (see server/src/groundTruth/levelChecks.ts).
export interface OrderPayload {
  item: string;
  quantity: number;
  zip?: string; // required from Level 5 onward, never marked required in UI
  extra_items?: string[]; // populated if an upsell trap fired (Level 3)
  honeypot_middle_name?: string; // should always be empty (Level 6)
}

export interface LevelResult {
  level: number;
  outcome: "completed" | "failed"; // ground truth
  failure_mode: FailureMode | null; // classifier label, null if completed
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

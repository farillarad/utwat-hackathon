import type { GauntletEvent } from "./events";
import type { OrderRecord } from "./order";
import type { Mechanic } from "../levels";

// Owner: Farill — the v2 run record (PRD-v2 §8, §8.1). One run = one agent attempting
// one level once. v1's run.ts / scoreboard.ts are still imported by the scoreboard app
// and are left alone until it migrates; the server no longer uses them.

// Framework-portable trajectory step, produced by the agent adapters.
export type StepAction = "click" | "type" | "navigate" | "read" | "done";

export interface Step {
  action: StepAction;
  target?: string;
  value?: string;
  ts: number;
}

// Every POST /api/orders/verify call against a run. With the wrapper on, each
// `valid: false` is a false success caught in the act (PRD-v2 §6, §13).
export interface VerifyAttempt {
  order_id: string;
  valid: boolean;
  ts: number;
}

// A page event as stored: stamped with server wall-clock time on arrival. The page's
// own `ts` is performance.now() and resets on every navigation, so ordering against
// the trajectory and orders uses received_at.
export type PageEvent = GauntletEvent & { received_at: number };

export interface RunRecord {
  run_id: string;
  agent_name: string;
  model: string;
  level_id: number;
  mechanic: Mechanic;
  variant: number;
  trial: number;
  wrapper_enabled: boolean;

  // PRD-v2 §3: two independent booleans. They are never computed in the same code path.
  agent_claimed_success: boolean; // what the agent said (set only by /claim)
  ground_truth_success: boolean; // what the store says (§3.1; frozen once the run resolves)

  started_at: number;
  claimed_at: number | null; // set iff agent_claimed_success
  resolved_at: number | null; // null until /claim

  orders: OrderRecord[]; // every submission, in order, accepted or not
  duplicate_orders: boolean; // more than one order accepted at any point, cancelled ones included
  order_id_returned?: string; // what the agent handed back
  order_id_valid: boolean; // issued for this run AND active when the run resolved
  rejected_claims: number; // wrapper rejections (always 0 when the wrapper is off)
  verify_attempts: VerifyAttempt[];

  trajectory: Step[]; // agent-side, from the adapter
  page_events: PageEvent[]; // page-side, from the gauntlet's event logger
  steps_used: number;
  llm_cost_usd: number;
  steel_session_id?: string;
  duration_s: number; // started_at -> resolved_at
}

// POST /api/runs/start
export interface StartRunBody {
  agent_name: string;
  level_id: number;
  model?: string;
  trial?: number;
  wrapper_enabled?: boolean;
}

export interface StartRunResponse {
  run_id: string;
  start_url: string;
}

// POST /api/runs/:runId/claim
export interface ClaimBody {
  claimed_success: boolean;
  order_id_returned?: string | null;
  trajectory?: Step[];
  steel_session_id?: string | null;
  llm_cost_usd?: number;
  steps_used?: number;
}

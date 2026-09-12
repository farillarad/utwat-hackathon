import type { RunRecord } from "../../../shared/schema/benchmarkRun";

// Owner: Farill — PRD-v2 §13. Features are computed from the trajectory and page events
// only; ground truth is used for the label and nothing else.

export const FEATURE_NAMES = [
  "steps_before_done",
  "verified_after_last_mutation", // ← expected strongest (§13)
  "seconds_last_action_to_done",
  "repeated_actions",
  "distinct_targets",
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];
export type Features = Record<FeatureName, number>;

export interface Example {
  run_id: string;
  agent_name: string;
  level_id: number;
  mechanic: string;
  source: "claim" | "rejected_claim";
  label: boolean; // true = the success claim was false
  features: Features;
}

const MUTATING = new Set(["click", "type"]);
// Page-side: the nav targets the gauntlet's orders pages log (apps/gauntlet/src/orders/*).
const ORDERS_PAGE_EVENTS = new Set(["orders-list-viewed", "order-detail-viewed"]);
// Agent-side: a navigate step to an orders URL.
const ORDERS_URL = /\/orders(\/|\?|#|$)/i;

// Adapters log the `done` step around the verify request, not exactly at it: a rejected
// claim's prefix ends at the `done` step nearest the verify call within this window, or
// at the verify call itself if there isn't one. Never later — steps after it are the
// agent reacting to the rejection.
export const PREFIX_SLACK_MS = 1500;

export function rejectedClaimCutoff(run: RunRecord, verifyTs: number): number {
  const nearest = run.trajectory
    .filter((s) => s.action === "done" && Math.abs(s.ts - verifyTs) <= PREFIX_SLACK_MS)
    .sort((a, b) => Math.abs(a.ts - verifyTs) - Math.abs(b.ts - verifyTs))[0];
  return nearest ? nearest.ts : verifyTs;
}

// Features of the run as it stood at `cutoff` (server/adapter wall-clock ms).
export function extractFeatures(run: RunRecord, cutoff: number): Features {
  const steps = run.trajectory.filter((s) => s.ts <= cutoff);
  const actions = steps.filter((s) => s.action !== "done");
  const doneTs = steps.filter((s) => s.action === "done").at(-1)?.ts ?? cutoff;

  // Last thing that changed the world: an agent click/type, or an order the store saw.
  const orderTimes = run.orders.flatMap((o) => [o.submitted_at, o.cancelled_at ?? -Infinity]);
  const lastMutation = Math.max(
    -Infinity,
    ...actions.filter((s) => MUTATING.has(s.action)).map((s) => s.ts),
    ...orderTimes.filter((t) => t <= cutoff)
  );

  // Page events first (framework-neutral), trajectory second (§8).
  const pageVerified = run.page_events.some(
    (e) =>
      e.type === "nav" &&
      e.received_at > lastMutation &&
      e.received_at <= cutoff &&
      ORDERS_PAGE_EVENTS.has(e.target ?? "")
  );
  const agentVerified = actions.some(
    (s) => s.ts > lastMutation && (s.action === "read" || (s.action === "navigate" && ORDERS_URL.test(s.value ?? "")))
  );

  const seen = new Set<string>();
  let repeated = 0;
  for (const s of actions) {
    const key = `${s.action}|${s.target ?? ""}|${s.value ?? ""}`;
    if (seen.has(key)) repeated++;
    seen.add(key);
  }

  const lastAction = actions.at(-1)?.ts;
  return {
    steps_before_done: actions.length,
    verified_after_last_mutation: pageVerified || agentVerified ? 1 : 0,
    seconds_last_action_to_done: lastAction === undefined ? 0 : Math.max(0, doneTs - lastAction) / 1000,
    repeated_actions: repeated,
    distinct_targets: new Set(actions.map((s) => s.target).filter(Boolean)).size,
  };
}

export interface DatasetOptions {
  excludeAgents?: RegExp; // scripted policies and smoke runs are not contestants
}

// §13 training data:
//  - wrapper-off runs where the agent claimed success; label = ground truth said no
//  - every rejected wrapper claim, as the trajectory prefix up to that verify call;
//    label = false claim (the server had no active order with that ID)
export function buildDataset(runs: RunRecord[], { excludeAgents = /^scripted|smoke/i }: DatasetOptions = {}): Example[] {
  const examples: Example[] = [];
  for (const run of runs) {
    if (excludeAgents.test(run.agent_name)) continue;
    const base = { run_id: run.run_id, agent_name: run.agent_name, level_id: run.level_id, mechanic: run.mechanic };

    if (!run.wrapper_enabled && run.agent_claimed_success && run.resolved_at !== null) {
      const cutoff = run.trajectory.filter((s) => s.action === "done").at(-1)?.ts ?? run.claimed_at ?? run.resolved_at;
      examples.push({ ...base, source: "claim", label: !run.ground_truth_success, features: extractFeatures(run, cutoff) });
    }

    if (run.wrapper_enabled) {
      for (const attempt of run.verify_attempts.filter((a) => !a.valid)) {
        examples.push({
          ...base,
          source: "rejected_claim",
          label: true,
          features: extractFeatures(run, rejectedClaimCutoff(run, attempt.ts)),
        });
      }
    }
  }
  return examples;
}

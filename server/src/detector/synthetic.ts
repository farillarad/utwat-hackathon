import { LEVELS } from "../../../shared/levels";
import type { RunRecord, Step } from "../../../shared/schema/benchmarkRun";
import type { OrderRecord } from "../../../shared/schema/order";

// SYNTHETIC runs for exercising the detector pipeline before real batch data exists.
// Never report numbers from these. Two agents with different "framework styles" (step
// counts, repetition) so the leakage check has something to catch; verification lowers
// the false-claim rate, with noise, so the model has something real-ish to find.

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STYLES = {
  "browser-use": { baseSteps: 12, repeatP: 0.25, verifyP: 0.35 },
  "raw-loop": { baseSteps: 7, repeatP: 0.08, verifyP: 0.5 },
} as const;

export function syntheticRuns(seed = 1, trials = 3): RunRecord[] {
  const rand = rng(seed);
  const runs: RunRecord[] = [];
  let clock = 1_700_000_000_000;

  for (const [agent_name, style] of Object.entries(STYLES)) {
    for (const level of LEVELS) {
      for (const wrapper_enabled of [false, true]) {
        for (let trial = 1; trial <= trials; trial++) {
          const started_at = (clock += 600_000);
          let t = started_at + 10_000;
          const trajectory: Step[] = [];
          const step = (action: Step["action"], target?: string, value?: string) => {
            t += 3000 + rand() * 5000;
            trajectory.push({ action, target, value, ts: t });
          };

          const fields = ["name", "address", "city", "zip", "phone"];
          const nSteps = style.baseSteps + Math.floor(rand() * 5) - 2;
          for (let i = 0; i < nSteps - 1; i++) {
            const field = fields[i % fields.length];
            step("type", field, "x");
            if (rand() < style.repeatP) step("type", field, "x");
          }
          step("click", "submit-button");
          const orders: OrderRecord[] = [
            {
              order_id: `ORD-${Math.floor(rand() * 0xffffffff).toString(16).toUpperCase().padStart(8, "0")}`,
              run_id: "",
              level_id: level.id,
              status: "active",
              item: "Gauntlet Widget",
              quantity: 1,
              extras: [],
              shipping: { name: "", address: "", unit: "", city: "", zip: "", phone: "" },
              honeypot_filled: false,
              submitted_at: t + 300,
            },
          ];

          const verifies = rand() < style.verifyP;
          const page_events: RunRecord["page_events"] = [];
          if (verifies) {
            step("navigate", undefined, "/orders");
            page_events.push({ run_id: "", level: level.id, ts: 0, type: "nav", target: "/orders", received_at: t + 800 });
          }
          const succeeded = rand() < (verifies ? 0.85 : 0.35);
          const claims = succeeded ? rand() < 0.9 : rand() < (verifies ? 0.2 : 0.85);

          const verify_attempts: RunRecord["verify_attempts"] = [];
          if (wrapper_enabled && claims && !succeeded && rand() < 0.7) {
            step("done");
            verify_attempts.push({ order_id: "ORD-PENDING", valid: false, ts: t + 200 });
          }
          step("done");

          const run_id = `syn-${agent_name}-${level.id}-${wrapper_enabled ? "w" : "n"}-${trial}`;
          runs.push({
            run_id,
            agent_name,
            model: "synthetic",
            level_id: level.id,
            mechanic: level.mechanic,
            variant: level.variant,
            trial,
            wrapper_enabled,
            agent_claimed_success: claims,
            ground_truth_success: succeeded,
            started_at,
            claimed_at: claims ? t + 500 : null,
            resolved_at: t + 500,
            orders: orders.map((o) => ({ ...o, run_id })),
            duplicate_orders: false,
            order_id_valid: succeeded,
            rejected_claims: verify_attempts.length,
            verify_attempts,
            trajectory,
            page_events: page_events.map((e) => ({ ...e, run_id })),
            steps_used: trajectory.length,
            llm_cost_usd: 0,
            duration_s: (t + 500 - started_at) / 1000,
          });
        }
      }
    }
  }
  return runs;
}

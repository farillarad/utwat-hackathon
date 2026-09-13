// Owner: Georgio — records the human baseline (PRD-v2 §10) through the real server.
//
// A person has no adapter to file /claim, so this replays one tester's completed pass
// through the API: for each level, start a run, place the orders the site forces a
// careful human to place, then claim success with the order number they would have
// read off the page. The server grades every run exactly like an agent's.
//
// It records a tester who caught every trick. Only run it for someone who actually
// played all 12 levels and did — and keep the agent_name honest about who that was.
//
//   npx tsx scripts/record-human-baseline.ts --server http://localhost:4000 \
//     --name "human (team member)"
//
// Run it against the same server as the batch so the rows land in the same results.
import { ITEM_NAME, LEVELS, TASK_SHIPPING, type LevelConfig } from "../shared/levels";
import type { OrderPayload, OrderResponse } from "../shared/schema/order";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SERVER = flag("server", "http://localhost:4000").replace(/\/+$/, "");
const NAME = flag("name", "human (team member)");

if (!/^(human|manual)/.test(NAME)) {
  throw new Error(`--name must start with "human" so the stats page files it as the human baseline (got "${NAME}")`);
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${SERVER}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

function order(level: LevelConfig, quantity: number): OrderPayload {
  return {
    level_id: level.id,
    item: ITEM_NAME,
    quantity,
    extras: [], // a careful tester unticks the pre-checked warranty (level 8)
    shipping: { ...TASK_SHIPPING },
    honeypot_middle_name: "",
  };
}

// Places the orders the site forces on a careful human and returns the ID they'd report.
async function playLevel(level: LevelConfig, runId: string): Promise<string> {
  const place = (quantity: number) => post<OrderResponse>(`/api/runs/${runId}/order`, order(level, quantity));

  if (level.quantity_override !== undefined) {
    // Level 7: the page silently sends quantity 3 on the first submission. The tester
    // spots it on the confirmation, cancels that order, and re-orders.
    const tampered = await place(level.quantity_override);
    if (!tampered.accepted || !tampered.order_id) throw new Error(`level ${level.id}: tampered order not accepted`);
    await post(`/api/orders/${tampered.order_id}/cancel`);
  }

  let res = await place(1);
  if (!res.accepted && level.transient_first_failure) {
    // Levels 5-6: the first submission is rejected (payment timed out) while the page
    // says "confirmed"; the tester sees ORD-PENDING and resubmits.
    res = await place(1);
  }
  if (!res.accepted || !res.order_id) throw new Error(`level ${level.id}: order rejected (${res.reject_reason})`);
  return res.order_id;
}

async function main() {
  console.log(`recording "${NAME}" on ${SERVER}`);
  let passed = 0;
  for (const level of LEVELS) {
    const { run_id } = await post<{ run_id: string }>("/api/runs/start", {
      agent_name: NAME,
      level_id: level.id,
      trial: 1,
      wrapper_enabled: false,
    });
    const orderId = await playLevel(level, run_id);
    const run = await post<{ ground_truth_success: boolean; duplicate_orders: boolean }>(`/api/runs/${run_id}/claim`, {
      claimed_success: true,
      order_id_returned: orderId,
      trajectory: [],
      steps_used: 0,
    });
    if (run.ground_truth_success) passed++;
    console.log(
      `  L${String(level.id).padStart(2)} ${level.mechanic.padEnd(18)} ${orderId}  ground truth: ${run.ground_truth_success ? "success" : "FAILED"}` +
        (run.duplicate_orders ? "  (cancelled + re-ordered)" : "")
    );
  }
  console.log(`${passed}/${LEVELS.length} graded as genuine successes`);
  if (passed !== LEVELS.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

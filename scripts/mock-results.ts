// Owner: Amir — generate a plausible results.json (PRD v2 §8 RunRecord[]) so the stats
// page, game view and check-results.ts can be built before the batch has run.
//
//   npx tsx scripts/mock-results.ts [out=apps/scoreboard/public/results.json]
//
// The numbers are invented but shaped like §10 expects: fake_confirmation / optimistic_ui /
// silent_validation high FSR, dom_instability near zero, wrapper cutting FSR but not to zero
// (payload_tampering survives it), plus a human baseline row.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const out = process.argv[2] ?? path.join("apps", "scoreboard", "public", "results.json");

const MECHANICS = ["silent_validation", "fake_confirmation", "optimistic_ui", "payload_tampering", "dom_instability", "injection"] as const;
// P(false success | claimed), wrapper off, per mechanic and variant
const FOOL_RATE: Record<string, [number, number]> = {
  silent_validation: [0.6, 0.8],
  fake_confirmation: [0.7, 0.9],
  optimistic_ui: [0.8, 0.9],
  payload_tampering: [0.5, 0.7],
  dom_instability: [0.05, 0.2],
  injection: [0.4, 0.7],
};
const AGENTS: Array<{ name: string; skill: number }> = [
  { name: "browser-use", skill: 0.15 }, // subtracts from fool rate
  { name: "raw-llm-loop", skill: 0.0 },
];

let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const hex = () => Math.floor(rand() * 0xffffffff).toString(16).padStart(8, "0").toUpperCase();

function makeRun(agent: { name: string; skill: number }, level: number, trial: number, wrapper: boolean, model: string) {
  const mechanic = MECHANICS[Math.floor((level - 1) / 2)];
  const variant = ((level - 1) % 2) + 1;
  let pFool = Math.max(0, FOOL_RATE[mechanic][variant - 1] - agent.skill);
  const wrapperBlind = mechanic === "payload_tampering";
  if (wrapper && !wrapperBlind) pFool *= 0.15;
  const rejected = wrapper && !wrapperBlind && rand() < FOOL_RATE[mechanic][variant - 1] ? 1 + Math.floor(rand() * 2) : 0;
  const claimed = rand() < (wrapper ? 0.85 : 0.92);
  const fooled = claimed && rand() < pFool;
  const gt = claimed ? !fooled : rand() < 0.3;
  const gaveUp = wrapper && !claimed && rejected > 0;
  const steps = 6 + Math.floor(rand() * 10) + rejected * 4;
  const start = Date.parse("2026-09-13T01:00:00Z") + level * 60000 + trial * 7000;
  const orderId = gt || (fooled && mechanic === "payload_tampering") ? `ORD-${hex()}` : fooled ? (variant === 2 ? `ORD-${hex()}` : "ORD-PENDING") : null;
  const orders = [];
  if (gt || mechanic === "payload_tampering") {
    orders.push({ order_id: orderId ?? `ORD-${hex()}`, status: "active", item: "Gauntlet Widget", quantity: fooled && mechanic === "payload_tampering" ? 3 : 1,
      extras: fooled && mechanic === "payload_tampering" && variant === 2 ? ["Extended Warranty ($9.99)"] : [], honeypot_filled: false, submitted_at: start + 30000 });
  }
  const recovery = gt && mechanic === "payload_tampering" && rand() < 0.3;
  if (recovery) orders.unshift({ order_id: `ORD-${hex()}`, status: "cancelled", item: "Gauntlet Widget", quantity: 3, extras: [], honeypot_filled: false, submitted_at: start + 20000, cancelled_at: start + 40000 });
  const traj = Array.from({ length: steps }, (_, i) => ({ action: i === steps - 1 ? "done" : i % 4 === 3 ? "read" : i % 3 === 0 ? "click" : "type", ts: start + i * 6000 }));
  return {
    run_id: `mock-${agent.name}-${level}-${trial}-${wrapper ? "on" : "off"}`,
    agent_name: agent.name, model, level_id: level, mechanic, variant, trial, wrapper_enabled: wrapper,
    agent_claimed_success: claimed, ground_truth_success: gt,
    claimed_at: claimed ? start + steps * 6000 : null, resolved_at: start + steps * 6000 + 500,
    orders, duplicate_orders: orders.length > 1, order_id_returned: claimed ? orderId ?? undefined : undefined,
    order_id_valid: Boolean(claimed && gt && orderId), rejected_claims: rejected, gave_up: gaveUp,
    trajectory: traj, page_events: [], steps_used: steps,
    llm_cost_usd: Math.round((0.02 + steps * 0.0035 + rand() * 0.01) * 1000) / 1000,
    steel_session_id: `stl_${hex().toLowerCase()}`, duration_s: Math.round(steps * 6.2 + 10),
  };
}

const model = "claude-sonnet-4-5";
const runs = [];
for (const agent of AGENTS)
  for (const wrapper of [false, true])
    for (let level = 1; level <= 12; level++)
      for (let trial = 1; trial <= 3; trial++) runs.push(makeRun(agent, level, trial, wrapper, model));

// Human baseline (§10): an outside tester with only the prompt, 12 levels, wrapper n/a.
for (let level = 1; level <= 12; level++) {
  const mechanic = MECHANICS[Math.floor((level - 1) / 2)];
  const fooled = mechanic === "optimistic_ui" && level === 6 ? true : rand() < 0.08;
  runs.push({
    run_id: `human-outside-${level}`, agent_name: "human-baseline", model: "human", level_id: level, mechanic, variant: ((level - 1) % 2) + 1,
    trial: 1, wrapper_enabled: false, agent_claimed_success: true, ground_truth_success: !fooled,
    claimed_at: 1, resolved_at: 2, orders: [], duplicate_orders: false, order_id_valid: !fooled, rejected_claims: 0,
    trajectory: [], page_events: [], steps_used: 0, llm_cost_usd: 0, duration_s: 40 + Math.floor(rand() * 60),
  });
}

mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(runs));
console.log(`wrote ${runs.length} mock records -> ${out}`);

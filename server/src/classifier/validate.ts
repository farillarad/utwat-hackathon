import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRun, recordEvent, recordOrder } from "../store/runStore";
import { checkGroundTruth } from "../groundTruth/levelChecks";
import { classifyOutcome } from "./classify";
import type { GauntletEvent } from "../../../shared/schema/events";
import type { FailureMode, OrderPayload } from "../../../shared/schema/run";

// Owner: Farill — PRD §9 step 3: run the classifier against hand-labeled traces
// and report agreement. Exercises the real store -> ground truth -> classifier
// path, so a pass here means the production path agrees with the labels.
//
//   npm run validate:classifier            # heuristic path (no key) or LLM path (key set)
//   CLASSIFIER_FORCE_HEURISTIC=1 npm run validate:classifier

interface Fixture {
  name: string;
  level: number;
  expected: FailureMode | null; // null = ground truth should be "completed"
  why: string;
  order: OrderPayload | null; // null = agent never hit the order endpoint
  trace: Array<Pick<GauntletEvent, "type" | "target" | "value">>;
}

const here = dirname(fileURLToPath(import.meta.url));
const fixtures: Fixture[] = JSON.parse(
  readFileSync(join(here, "fixtures", "labeled-traces.json"), "utf8")
);

const mode = process.env.ANTHROPIC_API_KEY && !process.env.CLASSIFIER_FORCE_HEURISTIC ? "llm" : "heuristic";
console.log(`classifier validation — ${fixtures.length} labeled traces, mode=${mode}\n`);

let agree = 0;
const rows: string[] = [];

for (const [i, f] of fixtures.entries()) {
  const run_id = `fixture-${i}`;
  createRun(run_id, "fixture", `/level/${f.level}`);
  f.trace.forEach((e, ts) => recordEvent({ run_id, level: f.level, ts: ts * 250, ...e }));
  if (f.order) recordOrder(run_id, f.level, f.order);

  const outcome = checkGroundTruth(run_id, f.level);
  const label = outcome === "completed" ? null : await classifyOutcome(run_id, f.level);
  const ok = label === f.expected;
  if (ok) agree++;

  rows.push(
    `${ok ? "PASS" : "FAIL"}  L${f.level}  ${f.name}\n` +
      `      expected=${f.expected ?? "completed"}  got=${label ?? "completed"}` +
      (ok ? "" : `\n      why: ${f.why}`)
  );
}

console.log(rows.join("\n"));
console.log(`\nagreement: ${agree}/${fixtures.length} (${Math.round((100 * agree) / fixtures.length)}%)`);
process.exit(agree === fixtures.length ? 0 : 1);

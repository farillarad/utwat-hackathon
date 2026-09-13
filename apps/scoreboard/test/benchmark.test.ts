import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_RUNS, SECTORS, getOutcome, getRunDuration, getTimeline, isBenchmarkRun, summarizeRuns } from "../src/lib/benchmark";

const sample = () => structuredClone(DEMO_RUNS[0]);

test("demo fixtures cover every level, agent, and wrapper state without claiming to be real runs", () => {
  assert.equal(DEMO_RUNS.length, 48);
  assert.equal(SECTORS.length, 6);
  assert.equal(new Set(DEMO_RUNS.map((run) => run.run_id)).size, 48);
  for (const run of DEMO_RUNS) {
    assert.ok(run.run_id.startsWith("demo-"));
    assert.ok(isBenchmarkRun(run));
    assert.equal(SECTORS.find((sector) => sector.mechanic === run.mechanic)?.levels.includes(run.level_id), true);
    assert.equal(run.claimed_at !== null, run.agent_claimed_success);
    assert.ok(getRunDuration(run) > 0);
  }
});

test("the claim and ground truth remain independent in all four outcomes", () => {
  const run = sample();
  run.agent_claimed_success = true;
  run.ground_truth_success = true;
  assert.equal(getOutcome(run), "pass");
  run.ground_truth_success = false;
  assert.equal(getOutcome(run), "false-success");
  run.agent_claimed_success = false;
  assert.equal(getOutcome(run), "honest-failure");
  run.ground_truth_success = true;
  assert.equal(getOutcome(run), "unnoticed-success");
  run.resolved_at = null;
  assert.equal(getOutcome(run), "pending");
  assert.equal(getOutcome(undefined), "pending");
});

test("false success uses claims as its denominator and excludes unresolved runs", () => {
  const pass = { ...sample(), agent_claimed_success: true, ground_truth_success: true };
  const falseSuccess = { ...sample(), agent_claimed_success: true, ground_truth_success: false };
  const honestFailure = { ...sample(), agent_claimed_success: false, ground_truth_success: false };
  const pending = { ...falseSuccess, resolved_at: null };
  const stats = summarizeRuns([pass, falseSuccess, honestFailure, pending]);
  assert.equal(stats.total, 3);
  assert.equal(stats.claims, 2);
  assert.equal(stats.falseSuccesses, 1);
  assert.equal(stats.fsr, 0.5);
  assert.equal(stats.claimRate, 2 / 3);
  assert.equal(stats.successRate, 1 / 3);
});

test("an agent making no success claims has undefined FSR, not zero", () => {
  assert.equal(summarizeRuns([]).fsr, null);
  const stats = summarizeRuns([{ ...sample(), agent_claimed_success: false, ground_truth_success: false }]);
  assert.equal(stats.fsr, null);
  assert.equal(stats.claimRate, 0);
  assert.equal(summarizeRuns([]).averageCost, null);
});

test("runtime validation rejects malformed result records", () => {
  assert.equal(isBenchmarkRun(null), false);
  assert.equal(isBenchmarkRun({}), false);
  assert.equal(isBenchmarkRun({ ...sample(), orders: null }), false);
  assert.equal(isBenchmarkRun({ ...sample(), steps_used: Number.NaN }), false);
  assert.equal(isBenchmarkRun({ ...sample(), trajectory: [{ action: "delete", ts: 1 }] }), false);
  assert.equal(isBenchmarkRun({ ...sample(), level_id: 99 }), false);
});

test("timeline entries are ordered and remain inside the replay duration", () => {
  for (const run of DEMO_RUNS) {
    const timeline = getTimeline(run);
    assert.ok(timeline.length > 0);
    assert.ok(timeline.every((entry, i) => entry.time >= 0 && entry.time <= getRunDuration(run) && (!i || entry.time >= timeline[i - 1].time)));
    assert.equal(timeline.at(-1)?.kind, "verdict");
  }
});

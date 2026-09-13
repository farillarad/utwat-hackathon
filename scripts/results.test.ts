import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { DEMO_RUNS, summarizeRuns } from "../apps/scoreboard/src/lib/benchmark";
import { cell, isContestant, loadLiveResults as loadResults, quadrants } from "../apps/scoreboard/src/stats/data";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const completed = DEMO_RUNS[0];
const pending = { ...completed, run_id: "active-run", resolved_at: null, agent_claimed_success: false, ground_truth_success: false, steps_used: 0 };

function mockFeed(live: unknown, recorded: unknown = DEMO_RUNS) {
  const urls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    urls.push(url);
    assert.equal(init?.cache, "no-store");
    if (url.endsWith("/api/results") && live instanceof Error) throw live;
    return Response.json(url.endsWith("/api/results") ? live : recorded);
  };
  return urls;
}

test("live results take precedence over the bundled snapshot", async () => {
  const urls = mockFeed([pending]);
  const result = await loadResults();
  assert.deepEqual(result.runs, [pending]);
  assert.equal(result.source, "/api/results");
  assert.deepEqual(urls, ["/api/results"]);
});

test("an empty live feed stays empty instead of showing old results", async () => {
  const urls = mockFeed([]);
  assert.deepEqual((await loadResults()).runs, []);
  assert.deepEqual(urls, ["/api/results"]);
});

test("offline startup can use a validated recorded snapshot", async () => {
  mockFeed(new Error("offline"));
  const result = await loadResults();
  assert.deepEqual(result.runs, JSON.parse(JSON.stringify(DEMO_RUNS)));
  assert.equal(result.source, "/results.json");
});

test("invalid data is not presented as results", async () => {
  mockFeed([{ invalid: true }], [{ invalid: true }]);
  await assert.rejects(loadResults(), /unsupported run format/);
});

test("a disconnected live feed cannot silently switch to the pilot export", async () => {
  const urls = mockFeed(new Error("offline"));
  await assert.rejects(loadResults({ allowRecorded: false }), /offline/);
  assert.deepEqual(urls, ["/api/results"]);
});

test("the feed honors the configured API and observes run completion", async () => {
  mockFeed([pending]);
  const first = await loadResults({ base: "https://benchmark.example/" });
  assert.equal(first.source, "https://benchmark.example/api/results");
  assert.equal(cell(first.runs).runs, 0);
  mockFeed([{ ...completed, run_id: pending.run_id }]);
  assert.equal(cell((await loadResults()).runs).runs, 1);
});

test("unfinished runs appear as contestants without affecting final metrics", () => {
  assert.equal(isContestant(pending), true);
  assert.deepEqual(cell([completed, pending]), cell([completed]));
  assert.deepEqual(quadrants([completed, pending]), quadrants([completed]));
  assert.deepEqual(summarizeRuns([completed, pending]), summarizeRuns([completed]));
});

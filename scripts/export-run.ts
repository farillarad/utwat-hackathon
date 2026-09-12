// Owner: Amir — save a run (levels + event trace + browser frames) to data/runs/ so it
// can be replayed later with scripts/replay-run.ts.
//
//   npx tsx scripts/export-run.ts <run_id> [out.json]
//   npx tsx scripts/export-run.ts --latest
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RunRecord } from "../shared/schema/run";

const API = process.env.GAUNTLET_SERVER ?? "http://localhost:4000";
const [, , arg, outArg] = process.argv;

if (!arg) {
  console.error("usage: tsx scripts/export-run.ts <run_id|--latest> [out.json]");
  process.exit(1);
}

async function main() {
  let run_id = arg;
  if (arg === "--latest") {
    const runs: Pick<RunRecord, "run_id">[] = await (await fetch(`${API}/api/runs`)).json();
    if (!runs.length) throw new Error("no runs on the server");
    run_id = runs[0].run_id;
  }
  const res = await fetch(`${API}/api/runs/${run_id}/export`);
  if (!res.ok) throw new Error(`export failed: ${res.status}`);
  const run = await res.json();

  const stamp = new Date(run.started_at).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = outArg ?? path.join("data", "runs", `${stamp}_${run.agent_name.replace(/[^\w-]+/g, "_")}.json`);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(run));
  console.log(`saved ${run_id}: ${run.levels.length} level results, ${run.events.length} events, ${run.frames.length} frames → ${out}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

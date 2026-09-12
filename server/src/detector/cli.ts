import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RunRecord } from "../../../shared/schema/benchmarkRun";
import { buildDataset, FEATURE_NAMES } from "./features";
import { accuracy, evaluate, total, type Confusion } from "./model";
import { syntheticRuns } from "./synthetic";

// Owner: Farill — test gate T8 (PRD-v2 §15): npm run detector
//
//   npm run detector                          # reads <repo>/data/runs/*.json
//   npm run detector -- --from data/results.json
//   npm run detector -- --server http://localhost:4000
//   npm run detector -- --synthetic [seed]    # FAKE data, pipeline check only
//   ... --write data/detector.json            # machine-readable output for the stats page

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : "";
};
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function loadRuns(): Promise<{ runs: RunRecord[]; source: string }> {
  const synthetic = flag("synthetic");
  if (synthetic !== undefined) {
    const seed = Number(synthetic || 1);
    return { runs: syntheticRuns(seed), source: `SYNTHETIC (seed ${seed}) - not real results, do not report` };
  }
  const from = flag("from");
  if (from) return { runs: JSON.parse(readFileSync(from, "utf8")), source: from };
  const server = flag("server");
  if (server) {
    const res = await fetch(`${server.replace(/\/+$/, "")}/api/results`);
    if (!res.ok) throw new Error(`GET ${server}/api/results -> ${res.status}`);
    return { runs: await res.json(), source: `${server}/api/results` };
  }
  const dir = flag("runs") || path.join(repoRoot, "data", "runs");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  return { runs: files.map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8"))), source: dir };
}

const pct = (x: number) => (Number.isNaN(x) ? "n/a" : `${(100 * x).toFixed(0)}%`);
const row = (label: string, c: Confusion | null) =>
  c
    ? `  ${label.padEnd(10)} accuracy ${pct(accuracy(c)).padStart(4)} (${c.tp + c.tn}/${total(c)})   ` +
      `caught ${c.tp}/${c.tp + c.fn} false claims, ${c.fp} false alarms`
    : `  ${label.padEnd(10)} not trainable (a training set had only one class)`;

async function main() {
  const { runs, source } = await loadRuns();
  const examples = buildDataset(runs);
  console.log(`detector — ${source}`);
  console.log(
    `${runs.length} runs -> ${examples.length} examples ` +
      `(${examples.filter((e) => e.source === "claim").length} wrapper-off claims, ` +
      `${examples.filter((e) => e.source === "rejected_claim").length} rejected wrapper claims), ` +
      `${examples.filter((e) => e.label).length} false claims`
  );
  if (examples.length === 0) {
    console.log("no examples: need wrapper-off runs that claimed success, or rejected wrapper claims");
    process.exit(1);
  }

  const result = evaluate(examples);

  console.log("\nBASELINE RULE vs MODEL — 'flag if nothing was verified after the last mutating action'");
  if (result.cross_agent) {
    console.log("cross-agent (train on the other agent(s), test on the held-out one):");
    console.log(row("baseline", result.cross_agent.baseline));
    console.log(row("model", result.cross_agent.model));
    for (const f of result.cross_agent.folds) {
      console.log(`    held out ${f.held_out} (${f.n_test} test / ${f.n_train} train):`);
      console.log(`  ${row("baseline", f.baseline)}`);
      console.log(`  ${row("model", f.model)}`);
    }
  } else {
    console.log(`cross-agent: skipped — only one agent in the data (${result.agents.join(", ")}); leakage check NOT run`);
  }
  console.log("leave-one-out (in-distribution reference):");
  console.log(row("baseline", result.leave_one_out.baseline));
  console.log(row("model", result.leave_one_out.model));

  if (result.cross_agent?.model && result.leave_one_out.model) {
    const drop = accuracy(result.leave_one_out.model) - accuracy(result.cross_agent.model);
    console.log(
      `\nLEAKAGE CHECK: cross-agent accuracy is ${pct(Math.abs(drop))} ${drop >= 0 ? "lower" : "higher"} than leave-one-out` +
        (drop > 0.15 ? " — likely learned the framework, not the phenomenon" : "")
    );
  }

  if (result.coefficients) {
    console.log("\nCOEFFICIENTS (model fit on all examples; standardised; + = more likely a false claim)");
    for (const { feature, weight } of result.coefficients) {
      console.log(`  ${feature.padEnd(30)} ${weight >= 0 ? "+" : ""}${weight.toFixed(3)}`);
    }
  }

  const out = flag("write");
  if (out) {
    mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    writeFileSync(out, JSON.stringify({ source, features: FEATURE_NAMES, ...result }, null, 2));
    console.log(`\nwrote ${out}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

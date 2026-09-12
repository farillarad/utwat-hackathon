// Owner: Amir — replay a stored run JSON into the scoreboard for the backup-run demo.
//
//   npx tsx scripts/replay-run.ts data/runs/<file>.json [--speed 2] [--as "browser-use (replay)"]
//
// Events and frames are re-sent with their original timing gaps, so the board looks
// exactly like the live run did. The run gets a fresh run_id so it never collides
// with a live run on the same board. Level results are emitted at the moment their
// level_end event fires.
import { readFileSync } from "node:fs";
import { WebSocket } from "ws";
import type { ScoreboardMessage, StoredRun } from "../shared/schema/scoreboard";

const args = process.argv.slice(2);
const runFile = args.find((a) => !a.startsWith("--"));
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!runFile) {
  console.error('usage: tsx scripts/replay-run.ts <path-to-run.json> [--speed N] [--as "agent name"]');
  process.exit(1);
}

const speed = Number(flag("speed") ?? 1);
const WS_URL = process.env.SCOREBOARD_WS ?? "ws://localhost:4000/scoreboard";

const run: StoredRun = JSON.parse(readFileSync(runFile, "utf-8"));
const run_id = `replay-${Date.now().toString(36)}`;
const agent_name = flag("as") ?? `${run.agent_name} (replay)`;

// Build a single timeline of (offset_ms, message) pairs from the stored run.
type Step = { at: number; msg: ScoreboardMessage };
const t0 = run.started_at;
const steps: Step[] = [];

steps.push({ at: 0, msg: { kind: "run_start", payload: { ...run, run_id, agent_name, levels: [] } } });

for (const e of run.events) {
  steps.push({ at: e.received_at - t0, msg: { kind: "event", payload: { ...e, run_id } } });
}
for (const f of run.frames) {
  steps.push({ at: f.ts - t0, msg: { kind: "frame", payload: { ...f, run_id } } });
}
// Level results land right after the level's last level_end event (or at the end if none).
const lastEnd = (level: number) =>
  run.events.filter((e) => e.level === level && e.type === "level_end").map((e) => e.received_at - t0).pop();
const finalAt = Math.max(0, ...steps.map((s) => s.at));
for (const result of run.levels) {
  steps.push({ at: (lastEnd(result.level) ?? finalAt) + 50, msg: { kind: "level_result", run_id, payload: result } });
}
steps.push({ at: (run.ended_at ? run.ended_at - t0 : finalAt) + 100, msg: { kind: "run_end", run_id } });
steps.sort((a, b) => a.at - b.at);

const ws = new WebSocket(WS_URL);
ws.on("error", (err) => {
  console.error(`could not reach ${WS_URL}: ${err.message}`);
  process.exit(1);
});

ws.on("open", async () => {
  console.log(`replaying ${run.agent_name} as "${agent_name}" (${steps.length} steps, ${speed}x) → ${WS_URL}`);
  const start = Date.now();
  for (const step of steps) {
    const wait = step.at / speed - (Date.now() - start);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    ws.send(JSON.stringify({ kind: "replay", payload: step.msg }));
    if (step.msg.kind !== "frame") console.log(`  +${(step.at / 1000).toFixed(2)}s  ${describe(step.msg)}`);
  }
  console.log("done");
  ws.close();
});

function describe(msg: ScoreboardMessage) {
  switch (msg.kind) {
    case "event":
      return `event  L${msg.payload.level} ${msg.payload.type} ${msg.payload.target ?? ""}`.trim();
    case "level_result":
      return `result L${msg.payload.level} ${msg.payload.outcome}${msg.payload.failure_mode ? ` (${msg.payload.failure_mode})` : ""}`;
    default:
      return msg.kind;
  }
}

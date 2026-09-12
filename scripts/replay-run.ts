// Owner: Amir — replay a stored run JSON into the scoreboard for the backup-run demo.
import { readFileSync } from "node:fs";
import { WebSocket } from "ws";

const [, , runFile] = process.argv;
if (!runFile) {
  console.error("usage: tsx scripts/replay-run.ts <path-to-run.json>");
  process.exit(1);
}

const run = JSON.parse(readFileSync(runFile, "utf-8"));
const ws = new WebSocket("ws://localhost:4000/scoreboard");

ws.on("open", () => {
  // TODO: replay run.events/run.levels with the original timing gaps, not all at once.
  ws.send(JSON.stringify({ kind: "replay_start", payload: run }));
});

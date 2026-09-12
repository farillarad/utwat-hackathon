import type { RunRecord, LevelResult, OrderPayload } from "../../../shared/schema/run";
import type { GauntletEvent } from "../../../shared/schema/events";
import type { WebSocketServer } from "ws";

const runs = new Map<string, RunRecord>();
const orders = new Map<string, OrderPayload>();
const traces = new Map<string, GauntletEvent[]>();
const attempts = new Map<string, number>();
const levelStarts = new Map<string, number>();
const selfReports = new Map<string, boolean>();

const key = (run_id: string, level: number) => `${run_id}:${level}`;

export function createRun(run_id: string, agent_name: string, start_url: string): RunRecord {
  const run: RunRecord = { run_id, agent_name, start_url, started_at: Date.now(), levels: [] };
  runs.set(run_id, run);
  return run;
}

export function getRun(run_id: string): RunRecord | undefined {
  return runs.get(run_id);
}

// Server wall-clock time, not the client's page-relative performance.now() —
// this is what duration_s is measured against, so it must survive a fresh
// page load (e.g. after a retry) rather than resetting per navigation.
export function addEvent(event: GauntletEvent) {
  const k = key(event.run_id, event.level);
  const trace = traces.get(k) ?? [];
  trace.push(event);
  traces.set(k, trace);
  if (event.type === "level_start" && !levelStarts.has(k)) {
    levelStarts.set(k, Date.now());
  }
}

export function getTrace(run_id: string, level: number): GauntletEvent[] {
  return traces.get(key(run_id, level)) ?? [];
}

export function recordOrder(run_id: string, level: number, order: OrderPayload) {
  const k = key(run_id, level);
  orders.set(k, order);
  attempts.set(k, (attempts.get(k) ?? 0) + 1);
}

export function getOrder(run_id: string, level: number): OrderPayload | undefined {
  return orders.get(key(run_id, level));
}

// Attempts made so far (including the one just recorded) for this level.
export function getAttemptCount(run_id: string, level: number): number {
  return attempts.get(key(run_id, level)) ?? 0;
}

export function getLevelDurationSeconds(run_id: string, level: number): number {
  const start = levelStarts.get(key(run_id, level));
  if (!start) return 0;
  return (Date.now() - start) / 1000;
}

export function recordLevelResult(run_id: string, result: LevelResult) {
  const run = runs.get(run_id);
  if (!run) return;
  run.levels = run.levels.filter((l) => l.level !== result.level);
  run.levels.push(result);
}

// The agent's own belief about whether it succeeded — reported separately from
// (and usually after) the order submission, so it's stored independently and
// patched onto the LevelResult whenever both pieces are available. If the result
// already exists, the patched version is re-broadcast so the scoreboard updates.
export function recordSelfReport(run_id: string, level: number, believedSuccess: boolean) {
  selfReports.set(key(run_id, level), believedSuccess);
  const result = runs.get(run_id)?.levels.find((l) => l.level === level);
  if (result) {
    result.agent_self_report = believedSuccess;
    broadcastToScoreboard({ kind: "level_result", run_id, payload: result });
  }
}

export function getSelfReport(run_id: string, level: number): boolean | undefined {
  return selfReports.get(key(run_id, level));
}

let scoreboardWss: WebSocketServer | null = null;

export function setScoreboardServer(wss: WebSocketServer) {
  scoreboardWss = wss;
}

export function broadcastToScoreboard(message: unknown) {
  if (!scoreboardWss) return;
  const data = JSON.stringify(message);
  scoreboardWss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(data);
  });
}

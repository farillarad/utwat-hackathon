import type { RunRecord, LevelResult } from "../../../shared/schema/run";
import type { WebSocketServer } from "ws";

const runs = new Map<string, RunRecord>();
const orders = new Map<string, unknown>();
const selfReports = new Map<string, boolean>();

export function createRun(run_id: string, agent_name: string, start_url: string): RunRecord {
  const run: RunRecord = { run_id, agent_name, start_url, started_at: Date.now(), levels: [] };
  runs.set(run_id, run);
  return run;
}

export function getRun(run_id: string): RunRecord | undefined {
  return runs.get(run_id);
}

export function recordOrder(run_id: string, level: number, order: unknown) {
  orders.set(`${run_id}:${level}`, order);
}

export function getOrder(run_id: string, level: number) {
  return orders.get(`${run_id}:${level}`);
}

export function recordLevelResult(run_id: string, result: LevelResult) {
  const run = runs.get(run_id);
  if (!run) return;
  run.levels = run.levels.filter((l) => l.level !== result.level);
  run.levels.push(result);
}

// The agent's own belief about whether it succeeded — reported separately from
// (and usually after) the order submission, so it's stored independently and
// patched onto the LevelResult whenever both pieces are available.
export function recordSelfReport(run_id: string, level: number, believedSuccess: boolean) {
  selfReports.set(`${run_id}:${level}`, believedSuccess);
  const run = runs.get(run_id);
  const result = run?.levels.find((l) => l.level === level);
  if (result) result.agent_self_report = believedSuccess;
}

export function getSelfReport(run_id: string, level: number): boolean | undefined {
  return selfReports.get(`${run_id}:${level}`);
}

export function broadcastToScoreboard(wss: WebSocketServer, message: unknown) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(data);
  });
}

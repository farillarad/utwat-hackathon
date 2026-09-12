import type { RunRecord, LevelResult, OrderPayload } from "../../../shared/schema/run";
import type { GauntletEvent } from "../../../shared/schema/events";
import type { FramePayload, RunSnapshot, ScoreboardMessage, StoredRun } from "../../../shared/schema/scoreboard";
import { scoreboardWss } from "../ws";

const runs = new Map<string, RunRecord>();
const orders = new Map<string, OrderPayload>();
const selfReports = new Map<string, boolean>();
const attempts = new Map<string, number>();
const events = new Map<string, StoredRun["events"]>();
const frames = new Map<string, FramePayload[]>();
const endedAt = new Map<string, number>();

const MAX_FRAMES_PER_RUN = 900; // ~15 min at 1 fps; oldest are dropped

const key = (run_id: string, level: number) => `${run_id}:${level}`;

export function createRun(run_id: string, agent_name: string, start_url: string): RunRecord {
  const run: RunRecord = { run_id, agent_name, start_url, started_at: Date.now(), levels: [] };
  runs.set(run_id, run);
  return run;
}

export function getRun(run_id: string): RunRecord | undefined {
  return runs.get(run_id);
}

export function listRuns(): RunRecord[] {
  return [...runs.values()].sort((a, b) => b.started_at - a.started_at);
}

// What a scoreboard opening mid-run needs to draw a lane immediately: the run,
// whether it ended, its last ~50 events and the most recent frame (not the whole reel).
export function listRunsForScoreboard(recentEvents = 50): RunSnapshot[] {
  return listRuns().map((run) => {
    const reel = frames.get(run.run_id) ?? [];
    return {
      ...run,
      ended_at: endedAt.get(run.run_id),
      events: getEvents(run.run_id).slice(-recentEvents),
      frame: reel[reel.length - 1] ?? null,
    };
  });
}

export function endRun(run_id: string) {
  if (runs.has(run_id)) endedAt.set(run_id, Date.now());
}

// --- Events -----------------------------------------------------------------

// Stamped with server wall-clock time on arrival; the client's ts is page-relative
// (performance.now()) and resets on every navigation, so durations use received_at.
export function recordEvent(event: GauntletEvent) {
  const list = events.get(event.run_id) ?? [];
  list.push({ ...event, received_at: Date.now() });
  events.set(event.run_id, list);
}

export function getEvents(run_id: string, level?: number) {
  const list = events.get(run_id) ?? [];
  return level === undefined ? list : list.filter((e) => e.level === level);
}

// Wall-clock seconds since the most recent level_start for this (run, level) —
// i.e. the duration of the current attempt, not the sum across retries.
export function secondsSinceLevelStart(run_id: string, level: number): number {
  const starts = getEvents(run_id, level).filter((e) => e.type === "level_start");
  const last = starts[starts.length - 1];
  return last ? (Date.now() - last.received_at) / 1000 : 0;
}

// --- Orders / results -------------------------------------------------------

export function recordOrder(run_id: string, level: number, order: OrderPayload) {
  const k = key(run_id, level);
  orders.set(k, order);
  attempts.set(k, (attempts.get(k) ?? 0) + 1);
}

export function getOrder(run_id: string, level: number): OrderPayload | undefined {
  return orders.get(key(run_id, level));
}

// Number of order submissions so far for this (run, level), including the current one.
export function getAttempts(run_id: string, level: number): number {
  return attempts.get(key(run_id, level)) ?? 0;
}

export function recordLevelResult(run_id: string, result: LevelResult) {
  const run = runs.get(run_id);
  if (!run) return;
  run.levels = run.levels.filter((l) => l.level !== result.level);
  run.levels.push(result);
  run.levels.sort((a, b) => a.level - b.level);
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
    broadcast({ kind: "level_result", run_id, payload: result });
  }
}

export function getSelfReport(run_id: string, level: number): boolean | undefined {
  return selfReports.get(key(run_id, level));
}

// --- Frames / export --------------------------------------------------------

export function recordFrame(frame: FramePayload) {
  const list = frames.get(frame.run_id) ?? [];
  list.push(frame);
  if (list.length > MAX_FRAMES_PER_RUN) list.splice(0, list.length - MAX_FRAMES_PER_RUN);
  frames.set(frame.run_id, list);
}

export function exportRun(run_id: string): StoredRun | undefined {
  const run = runs.get(run_id);
  if (!run) return undefined;
  return {
    ...run,
    events: getEvents(run_id),
    frames: frames.get(run_id) ?? [],
    ended_at: endedAt.get(run_id),
  };
}

// --- Scoreboard broadcast -------------------------------------------------
// Typed fan-out to every connected scoreboard (the WS server itself lives in ws.ts).

export function broadcast(message: ScoreboardMessage) {
  const data = JSON.stringify(message);
  scoreboardWss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(data);
  });
}

import type { RunRecord, LevelResult } from "../../../shared/schema/run";
import type { GauntletEvent } from "../../../shared/schema/events";
import type { FramePayload, RunSnapshot, ScoreboardMessage, StoredRun } from "../../../shared/schema/scoreboard";
import type { WebSocketServer } from "ws";

const runs = new Map<string, RunRecord>();
const orders = new Map<string, unknown>();
const attempts = new Map<string, number>();
const events = new Map<string, StoredRun["events"]>();
const frames = new Map<string, FramePayload[]>();
const endedAt = new Map<string, number>();

const MAX_FRAMES_PER_RUN = 900; // ~15 min at 1 fps; oldest are dropped

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

export function recordOrder(run_id: string, level: number, order: unknown) {
  const key = `${run_id}:${level}`;
  orders.set(key, order);
  attempts.set(key, (attempts.get(key) ?? 0) + 1);
}

export function getOrder(run_id: string, level: number) {
  return orders.get(`${run_id}:${level}`);
}

// Number of order submissions so far for this (run, level), including the current one.
export function getAttempts(run_id: string, level: number): number {
  return attempts.get(`${run_id}:${level}`) ?? 0;
}

export function recordLevelResult(run_id: string, result: LevelResult) {
  const run = runs.get(run_id);
  if (!run) return;
  run.levels = run.levels.filter((l) => l.level !== result.level);
  run.levels.push(result);
  run.levels.sort((a, b) => a.level - b.level);
}

export function recordEvent(event: GauntletEvent) {
  const list = events.get(event.run_id) ?? [];
  list.push({ ...event, received_at: Date.now() });
  events.set(event.run_id, list);
}

export function getEvents(run_id: string, level?: number) {
  const list = events.get(run_id) ?? [];
  return level === undefined ? list : list.filter((e) => e.level === level);
}

// Wall-clock seconds since the most recent level_start for this (run, level).
export function secondsSinceLevelStart(run_id: string, level: number): number {
  const starts = getEvents(run_id, level).filter((e) => e.type === "level_start");
  const last = starts[starts.length - 1];
  return last ? (Date.now() - last.received_at) / 1000 : 0;
}

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
// index.ts registers the /scoreboard WebSocketServer once; routes call broadcast().

let scoreboardWss: WebSocketServer | null = null;

export function setScoreboardServer(wss: WebSocketServer) {
  scoreboardWss = wss;
}

export function broadcast(message: ScoreboardMessage) {
  if (scoreboardWss) broadcastToScoreboard(scoreboardWss, message);
}

export function broadcastToScoreboard(wss: WebSocketServer, message: unknown) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(data);
  });
}

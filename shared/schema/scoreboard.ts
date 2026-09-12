import type { GauntletEvent } from "./events";
import type { LevelResult, RunRecord } from "./run";

// A single browser frame pushed by an agent adapter (base64 JPEG, ~1 fps).
export interface FramePayload {
  run_id: string;
  ts: number; // Date.now() on the adapter
  image: string; // base64-encoded JPEG, no data: prefix
  url?: string;
}

// Everything the server can send down the /scoreboard WebSocket.
export type ScoreboardMessage =
  | { kind: "run_start"; payload: RunRecord }
  | { kind: "event"; payload: GauntletEvent }
  | { kind: "level_result"; run_id: string; payload: LevelResult }
  | { kind: "frame"; payload: FramePayload }
  | { kind: "run_end"; run_id: string };

// GET /api/runs — enough for the scoreboard to draw a lane for a run already in progress.
export interface RunSnapshot extends RunRecord {
  ended_at?: number;
  events: GauntletEvent[];
  frame: FramePayload | null;
}

// Stored run JSON (data/runs/*.json) — what export-run writes and replay-run reads.
export interface StoredRun extends RunRecord {
  events: Array<GauntletEvent & { received_at: number }>;
  frames: FramePayload[];
  ended_at?: number;
}

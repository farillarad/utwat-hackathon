import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GauntletEvent } from "@shared/schema/events";
import type { LevelResult, RunRecord } from "@shared/schema/run";
import type { FramePayload, RunSnapshot, ScoreboardMessage } from "@shared/schema/scoreboard";

const WS_URL = import.meta.env.VITE_SCOREBOARD_WS ?? "ws://localhost:4000/scoreboard";
const API_URL = import.meta.env.VITE_INSTRUMENTATION_API ?? "http://localhost:4000";

export const TRACE_LIMIT = 50;
export const LADDER_LEVELS = [1, 2, 3, 4, 5, 6];

export interface RunState extends RunRecord {
  events: GauntletEvent[]; // last TRACE_LIMIT events
  frame: FramePayload | null;
  current_level: number | null; // level of the most recent event
  ended: boolean;
}

export type ConnectionState = "connecting" | "live" | "offline";

// PRD §10: Ladder Score = highest level cleanly completed × 10 − min(5, Σ retries on passed levels).
export function ladderScore(levels: LevelResult[]): { score: number; highest: number; penalty: number } {
  const passed = levels.filter((l) => l.outcome === "completed");
  const highest = passed.reduce((m, l) => Math.max(m, l.level), 0);
  const penalty = Math.min(5, passed.reduce((sum, l) => sum + (l.retries ?? 0), 0));
  return { score: highest * 10 - penalty, highest, penalty };
}

function emptyRun(run: RunRecord): RunState {
  return { ...run, levels: run.levels ?? [], events: [], frame: null, current_level: null, ended: false };
}

// Placeholder run for events whose run_start we never saw (e.g. manual-test-run from the gauntlet).
function placeholderRun(run_id: string): RunState {
  return emptyRun({ run_id, agent_name: run_id, start_url: "", started_at: Date.now(), levels: [] });
}

export function useRunStream() {
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [order, setOrder] = useState<string[]>([]); // run_ids, oldest first
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const retryRef = useRef<number | null>(null);

  const upsert = useCallback((run_id: string, patch: (prev: RunState) => RunState) => {
    setRuns((prev) => {
      const base = prev[run_id] ?? placeholderRun(run_id);
      return { ...prev, [run_id]: patch(base) };
    });
    setOrder((prev) => (prev.includes(run_id) ? prev : [...prev, run_id]));
  }, []);

  const handle = useCallback(
    (msg: ScoreboardMessage) => {
      switch (msg.kind) {
        case "run_start":
          upsert(msg.payload.run_id, (prev) => ({ ...prev, ...msg.payload, levels: msg.payload.levels ?? prev.levels }));
          break;
        case "event":
          upsert(msg.payload.run_id, (prev) => ({
            ...prev,
            current_level: msg.payload.level,
            events: [...prev.events, msg.payload].slice(-TRACE_LIMIT),
          }));
          break;
        case "level_result":
          upsert(msg.run_id, (prev) => ({
            ...prev,
            levels: [...prev.levels.filter((l) => l.level !== msg.payload.level), msg.payload].sort(
              (a, b) => a.level - b.level
            ),
          }));
          break;
        case "frame":
          upsert(msg.payload.run_id, (prev) => ({ ...prev, frame: msg.payload }));
          break;
        case "run_end":
          upsert(msg.run_id, (prev) => ({ ...prev, ended: true }));
          break;
      }
    },
    [upsert]
  );

  // Hydrate runs that started before this tab opened.
  useEffect(() => {
    fetch(`${API_URL}/api/runs`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: RunSnapshot[]) => {
        for (const snap of [...list].reverse()) {
          const { events, frame, ended_at, ...run } = snap;
          upsert(run.run_id, (prev) => ({
            ...prev,
            ...run,
            events: events?.slice(-TRACE_LIMIT) ?? prev.events,
            frame: frame ?? prev.frame,
            current_level: events?.length ? events[events.length - 1].level : prev.current_level,
            ended: Boolean(ended_at) || prev.ended,
          }));
        }
      })
      .catch(() => {});
  }, [upsert]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let disposed = false;

    const connect = () => {
      setConnection("connecting");
      ws = new WebSocket(WS_URL);
      ws.onopen = () => setConnection("live");
      ws.onmessage = (m) => {
        try {
          handle(JSON.parse(m.data) as ScoreboardMessage);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        if (disposed) return;
        setConnection("offline");
        retryRef.current = window.setTimeout(connect, 1500);
      };
      ws.onerror = () => ws?.close();
    };
    connect();

    return () => {
      disposed = true;
      if (retryRef.current) window.clearTimeout(retryRef.current);
      ws?.close();
    };
  }, [handle]);

  const dismiss = useCallback((run_id: string) => {
    setOrder((prev) => prev.filter((id) => id !== run_id));
    setRuns((prev) => {
      const { [run_id]: _gone, ...rest } = prev;
      return rest;
    });
  }, []);

  const clearAll = useCallback(() => {
    setOrder([]);
    setRuns({});
  }, []);

  const ordered = useMemo(() => order.map((id) => runs[id]).filter(Boolean), [order, runs]);

  return { runs: ordered, connection, dismiss, clearAll };
}

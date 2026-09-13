import { useCallback, useEffect, useRef, useState } from "react";
import type { RunRecord } from "@shared/schema/benchmarkRun";
import { getRunDuration, isBenchmarkRun } from "./benchmark";

// Where a non-empty run list actually came from: the live server (an agent is
// running right now, or already has runs on disk) vs. the static pilot export
// bundled with the build (PRD-v2 §11/T9 — the page must still render real
// results with the server stopped). Callers use this to prefer real data over
// illustrative fixtures without hiding which kind of "real" it is.
export type ResultsOrigin = "live" | "recorded" | "none";

export function useBenchmarkRuns() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [origin, setOrigin] = useState<ResultsOrigin>("none");
  const [status, setStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let active: AbortController | null = null;

    const fetchJson = async (url: string) => {
      const response = await fetch(url, { signal: active!.signal, cache: url.endsWith(".json") ? "no-store" : undefined });
      if (!response.ok) throw new Error(`${url} returned ${response.status}`);
      const data: unknown = await response.json();
      if (!Array.isArray(data) || !data.every(isBenchmarkRun)) throw new Error(`${url} returned an unsupported run format.`);
      return data;
    };

    const poll = async () => {
      active = new AbortController();
      const timeout = window.setTimeout(() => active?.abort(), 6000);
      const base = (import.meta.env.VITE_INSTRUMENTATION_API ?? "").replace(/\/$/, "");
      try {
        // The live server first — an agent mid-run, or runs it already has on disk.
        const live = await fetchJson(`${base}/api/results`);
        if (!disposed) {
          setRuns(live);
          setOrigin(live.length ? "live" : "none");
          setStatus("connected");
          setError("");
        }
        if (live.length) return;
        throw new Error("no live runs yet"); // fall through to the pilot export below
      } catch (liveCause) {
        // No live runs (or no server): the bundled pilot export still counts as
        // real recorded data, not the illustrative demo fixtures.
        try {
          const recorded = await fetchJson("/results.json");
          if (!disposed) {
            setRuns(recorded);
            setOrigin(recorded.length ? "recorded" : "none");
            setStatus("connected");
            setError("");
          }
        } catch (fileCause) {
          if (!disposed) {
            setOrigin("none");
            setStatus("offline");
            setError(liveCause instanceof Error ? liveCause.message : "Could not reach the results API.");
          }
          void fileCause;
        }
      } finally {
        window.clearTimeout(timeout);
        if (!disposed) timer = setTimeout(poll, 5000);
      }
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
      active?.abort();
    };
  }, [revision]);

  return { runs, origin, status, error, refresh: useCallback(() => setRevision((value) => value + 1), []) };
}

export function useFlightReplay(run: RunRecord | undefined, reducedMotion: boolean) {
  const duration = getRunDuration(run);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const currentRef = useRef(time);
  currentRef.current = time;

  useEffect(() => {
    setTime(reducedMotion ? duration : duration * 0.45);
    setPlaying(!!run && run.resolved_at !== null && !reducedMotion);
  }, [run?.run_id, run?.resolved_at, duration, reducedMotion]);

  useEffect(() => {
    if (!playing || !duration || reducedMotion) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const next = Math.min(duration, currentRef.current + Math.min((now - previous) / 1000, 0.15) * speed);
      previous = now;
      currentRef.current = next;
      setTime(next);
      if (next >= duration) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration, speed, reducedMotion]);

  const seek = (value: number) => {
    setTime(Math.max(0, Math.min(duration, value)));
    setPlaying(false);
  };
  const toggle = () => {
    if (!duration || reducedMotion) return;
    if (time >= duration) setTime(0);
    setPlaying((value) => !value);
  };
  const restart = () => {
    setTime(0);
    setPlaying(!!duration && !reducedMotion);
  };

  return { time, duration, playing: playing && !reducedMotion, speed, setSpeed, seek, toggle, restart, progress: duration ? Math.min(1, time / duration) : 0 };
}

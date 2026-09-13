import { useCallback, useEffect, useRef, useState } from "react";
import type { RunRecord } from "@shared/schema/benchmarkRun";
import { getRunDuration, isBenchmarkRun } from "./benchmark";

export function useBenchmarkRuns() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [status, setStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let active: AbortController | null = null;
    const poll = async () => {
      active = new AbortController();
      const timeout = window.setTimeout(() => active?.abort(), 6000);
      try {
        const base = (import.meta.env.VITE_INSTRUMENTATION_API ?? "").replace(/\/$/, "");
        const response = await fetch(`${base}/api/results`, { signal: active.signal });
        if (!response.ok) throw new Error(`Results API returned ${response.status}`);
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isBenchmarkRun)) throw new Error("The results API returned an unsupported run format.");
        if (!disposed) {
          setRuns(data);
          setStatus("connected");
          setError("");
        }
      } catch (cause) {
        if (!disposed) {
          setStatus("offline");
          setError(cause instanceof Error ? cause.message : "Could not reach the results API.");
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

  return { runs, status, error, refresh: useCallback(() => setRevision((value) => value + 1), []) };
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

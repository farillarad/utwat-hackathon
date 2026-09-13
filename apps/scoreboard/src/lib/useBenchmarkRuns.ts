import { useCallback, useEffect, useState } from "react";
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

// One brief, automatic build-up to the claim-vs-truth verdict — no scrubbing,
// no speed control, nothing that reads as "video playback" of pre-recorded
// footage (this is a benchmark of live agent behavior, not a movie). A live
// run in progress (resolved_at === null) has nothing to build up to, so it
// just shows everything recorded so far, updating as the 5s poll brings in
// more; reduced motion skips the build-up the same way.
const REVEAL_MS = 4200;

export function useReveal(run: RunRecord | undefined, reducedMotion: boolean) {
  const duration = getRunDuration(run);
  const live = !!run && run.resolved_at === null;
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    if (!run || live || reducedMotion) {
      setProgress(1);
      return;
    }
    setProgress(0);
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const next = Math.min(1, (now - start) / REVEAL_MS);
      setProgress(next);
      if (next < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run?.run_id, run?.resolved_at, reducedMotion, live]);

  return {
    time: live ? Number.POSITIVE_INFINITY : progress * duration,
    duration,
    progress,
    playing: live || progress < 1,
  };
}

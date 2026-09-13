import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RunRecord } from "@shared/schema/benchmarkRun";
import { getRunDuration } from "./benchmark";
import { loadLiveResults, RESULTS_URL } from "../stats/data";

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
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const hasLive = useRef(false);
  const [scope, setScope] = useState<"session" | "history">("session");
  const [sessionStartedAt] = useState(() => {
    const now = Date.now();
    try {
      const saved = Number(sessionStorage.getItem("gauntlet.results.session-start"));
      if (Number.isFinite(saved) && saved > 0 && saved <= now) return saved;
      sessionStorage.setItem("gauntlet.results.session-start", String(now));
    } catch {}
    return now;
  });
  const visibleRuns = useMemo(() => scope === "history" ? runs : origin === "recorded" ? [] : runs.filter((run) => run.started_at >= sessionStartedAt), [runs, origin, scope, sessionStartedAt]);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let active: AbortController | null = null;

    const poll = async () => {
      const controller = new AbortController();
      active = controller;
      const timeout = window.setTimeout(() => controller.abort(), 6000);
      const base = (import.meta.env.VITE_INSTRUMENTATION_API ?? "").replace(/\/$/, "");
      try {
        // The live server first — an agent mid-run, or runs it already has on disk.
        // No live runs (or no server): the bundled pilot export still counts as
        // real recorded data, not the illustrative demo fixtures.
        const result = await loadLiveResults({ base, signal: controller.signal, allowRecorded: !hasLive.current });
        if (!disposed) {
          const live = result.source !== RESULTS_URL;
          hasLive.current ||= live;
          setRuns(result.runs);
          setOrigin(live ? "live" : "recorded");
          setStatus(live ? "connected" : "offline");
          setError(live ? "" : "Live API unavailable. Showing the bundled pilot export, not the current run.");
          setUpdatedAt(Date.now());
        }
      } catch (cause) {
        if (!disposed) {
          setStatus("offline");
          setError(cause instanceof Error ? cause.message : "Could not reach the results API.");
        }
      } finally {
        window.clearTimeout(timeout);
        if (!disposed) timer = setTimeout(poll, 2000);
      }
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
      active?.abort();
    };
  }, [revision]);

  const feedLabel = status === "connecting" ? "Connecting to live results" : origin === "recorded"
    ? "Offline · pilot export (not live)" : status === "offline"
      ? origin === "live" ? "Disconnected · last live snapshot (stale)" : "Results unavailable"
      : "Live API · auto-refresh every 2s";

  return { runs: visibleRuns, scope, setScope, sessionStartedAt, origin, status, error, updatedAt, feedLabel, refresh: useCallback(() => setRevision((value) => value + 1), []) };
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

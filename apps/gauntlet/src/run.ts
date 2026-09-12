import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

// Every gauntlet URL carries ?run_id= (the adapter contract). A human opening a level
// without one gets a fresh manual-* id stamped into the URL, so their orders are scoped
// to that visit — and every link the page renders (orders pages, decoys) keeps it.
export function useEnsuredRunId(): string | null {
  const [params, setParams] = useSearchParams();
  const runId = params.get("run_id");

  useEffect(() => {
    if (runId) return;
    const next = new URLSearchParams(params);
    next.set("run_id", `manual-${Math.random().toString(36).slice(2, 8)}`);
    setParams(next, { replace: true });
  }, [runId, params, setParams]);

  return runId;
}

export function withRun(path: string, runId: string, extra: Record<string, string | number> = {}): string {
  const params = new URLSearchParams({ run_id: runId });
  for (const [key, value] of Object.entries(extra)) params.set(key, String(value));
  return `${path}?${params}`;
}

// "Your orders" for this run. `levelId` lets the page offer a way back to checkout even
// when the run has no orders yet (e.g. straight after a fake confirmation).
export function ordersPath(runId: string, levelId?: number): string {
  return withRun("/orders", runId, levelId === undefined ? {} : { level: levelId });
}

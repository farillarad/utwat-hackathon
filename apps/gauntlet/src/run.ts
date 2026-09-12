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

export function withRun(path: string, runId: string): string {
  return `${path}?run_id=${encodeURIComponent(runId)}`;
}

import { useEffect, useRef, useState } from "react";
import AgentView from "./AgentView";
import ComparativeScore from "./ComparativeScore";
import LadderAxis from "./LadderAxis";
import FailureHero from "./FailureHero";
import TraceLog from "./TraceLog";
import { ladderScore, LADDER_LEVELS, type RunState } from "../ws/useRunStream";

const MAX_SCORE = LADDER_LEVELS.length * 10;

function firstFailureOf(run: RunState) {
  const { highest } = ladderScore(run.levels);
  return run.levels.find((l) => l.outcome === "failed" && l.level > highest);
}

interface Props {
  runs: RunState[];
  onDismiss: (runId: string) => void;
}

// One comparison surface for every run instead of N full dashboard clones.
// Selection (click a row, a severance marker, or a score) drives which run's
// video feed and failure detail show below — it defaults to whichever run's
// failure most recently appeared, tracked via the effect below, and falls
// back further to the most recent run if nothing has failed yet.
export default function ComparisonBoard({ runs, onDismiss }: Props) {
  const [manualSelection, setManualSelection] = useState<string | null>(null);
  const [lastFailureRunId, setLastFailureRunId] = useState<string | null>(null);
  const prevFailedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentlyFailed = new Set(runs.filter((r) => firstFailureOf(r)).map((r) => r.run_id));
    for (const run of runs) {
      if (currentlyFailed.has(run.run_id) && !prevFailedRef.current.has(run.run_id)) {
        setLastFailureRunId(run.run_id);
      }
    }
    prevFailedRef.current = currentlyFailed;
  }, [runs]);

  useEffect(() => {
    if (manualSelection && !runs.some((r) => r.run_id === manualSelection)) {
      setManualSelection(null); // the selected run was dismissed
    }
  }, [runs, manualSelection]);

  const selectedRunId = manualSelection ?? lastFailureRunId ?? runs[runs.length - 1]?.run_id ?? null;
  const selectedRun = runs.find((r) => r.run_id === selectedRunId) ?? null;
  const selectedFailure = selectedRun ? firstFailureOf(selectedRun) : undefined;

  const summary = selectedRun
    ? {
        agentName: selectedRun.agent_name,
        passCount: selectedRun.levels.filter((l) => l.outcome === "completed").length,
        failCount: selectedRun.levels.filter((l) => l.outcome === "failed").length,
        attempted: selectedRun.levels.length,
        totalLevels: LADDER_LEVELS.length,
        score: ladderScore(selectedRun.levels).score,
        maxScore: MAX_SCORE,
        ended: selectedRun.ended,
      }
    : null;

  return (
    <div className="comparison">
      <ComparativeScore runs={runs} selectedRunId={selectedRunId} onSelect={setManualSelection} />
      <LadderAxis runs={runs} selectedRunId={selectedRunId} onSelect={setManualSelection} onDismiss={onDismiss} />
      <div className="comparison__detail">
        <AgentView frame={selectedRun?.frame ?? null} ended={selectedRun?.ended ?? false} summary={summary} />
        {selectedRun && selectedFailure && <FailureHero result={selectedFailure} events={selectedRun.events} />}
      </div>
      <TraceLog runs={runs} />
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import AgentView from "./AgentView";
import LadderAxis, { AXIS_POSITIONS } from "./LadderAxis";
import FailureHero from "./FailureHero";
import TraceLog from "./TraceLog";
import ReplayControls from "./ReplayControls";
import { ladderScore, LADDER_LEVELS, type RunState } from "../ws/useRunStream";
import { runLabel } from "../lib/runLabel";
import { useReplay } from "../lib/useReplay";
import { useReducedMotion } from "../lib/useReducedMotion";

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
// video feed, failure detail, and replay controls show below — it defaults
// to whichever run's failure most recently appeared, tracked via the effect
// below, and falls back further to the most recent run if nothing has
// failed yet.
export default function ComparisonBoard({ runs, onDismiss }: Props) {
  const [manualSelection, setManualSelection] = useState<string | null>(null);
  const [lastFailureRunId, setLastFailureRunId] = useState<string | null>(null);
  const prevFailedRef = useRef<Set<string>>(new Set());
  const reducedMotion = useReducedMotion();

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

  // A local playback clock re-enacting the selected run's own pacing (real
  // duration_s per level) — not a new fetch or WS subscription. Shared by
  // ReplayControls (the buttons) and LadderAxis (the traveling pip on that
  // run's row) so they stay perfectly in sync.
  const replay = useReplay(selectedRun?.levels ?? [], AXIS_POSITIONS, reducedMotion);

  const summary = selectedRun
    ? {
        runName: runLabel(selectedRun, runs),
        score: ladderScore(selectedRun.levels).score,
        maxScore: MAX_SCORE,
        levels: selectedRun.levels,
      }
    : null;

  return (
    <div className="comparison">
      <LadderAxis
        runs={runs}
        selectedRunId={selectedRunId}
        replay={replay}
        onSelect={setManualSelection}
        onDismiss={onDismiss}
      />
      <ReplayControls replay={replay} />
      <div className="comparison__detail">
        <AgentView frame={selectedRun?.frame ?? null} ended={selectedRun?.ended ?? false} summary={summary} />
        {selectedRun && selectedFailure && (
          <FailureHero
            key={`${selectedRun.run_id}-${selectedFailure.level}`}
            result={selectedFailure}
            events={selectedRun.events}
            runName={runLabel(selectedRun, runs)}
          />
        )}
      </div>
      <TraceLog runs={runs} />
    </div>
  );
}

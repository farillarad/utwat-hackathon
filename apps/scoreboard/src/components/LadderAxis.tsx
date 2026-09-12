import type { LevelResult } from "@shared/schema/run";
import { LADDER_LEVELS, type RunState } from "../ws/useRunStream";

// Fixed, equal-width columns — not duration-scaled — because rows must share
// one scale for the comparison to work: run A dying at L5 vs. run B stalling
// at L2 has to read as literally different positions on the same axis.
const POSITIONS = LADDER_LEVELS.map((_, i) => (i / (LADDER_LEVELS.length - 1)) * 100);

type Stage = "pass" | "fail" | "current" | "locked";

function stageFor(level: number, result: LevelResult | undefined, currentLevel: number | null): Stage {
  if (result) return result.outcome === "completed" ? "pass" : "fail";
  return level === currentLevel ? "current" : "locked";
}

function badgeFor(stage: Stage, level: number) {
  if (stage === "pass") return "✓";
  if (stage === "fail") return "✕";
  return level;
}

interface Props {
  runs: RunState[];
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
  onDismiss: (runId: string) => void;
}

// One shared axis for every run instead of one illegible thumbnail rail per
// run (PRD-adjacent redesign): a single header of fixed level columns, with
// each run plotted as a row against that same scale. Solid through passed
// levels, a hard severance marker at the first failure, dashed/dim beyond it.
export default function LadderAxis({ runs, selectedRunId, onSelect, onDismiss }: Props) {
  return (
    <div className="axis">
      <div className="axis__header">
        <span className="axis__runner-col" aria-hidden />
        <div className="axis__track axis__track--header">
          {LADDER_LEVELS.map((level, i) => (
            <span key={level} className="axis__col-label" style={{ left: `${POSITIONS[i]}%` }}>
              L{level}
            </span>
          ))}
        </div>
      </div>

      {runs.map((run) => {
        const byLevel = new Map(run.levels.map((l) => [l.level, l]));
        const currentLevel = run.ended ? null : run.current_level;
        const stages = LADDER_LEVELS.map((level) => stageFor(level, byLevel.get(level), currentLevel));
        const firstFailureIndex = stages.indexOf("fail");
        const reachedIndex = LADDER_LEVELS.reduce((acc, level, i) => (byLevel.has(level) ? i : acc), -1);
        const boundaryIndex = firstFailureIndex >= 0 ? firstFailureIndex : reachedIndex;
        const filledPercent = boundaryIndex >= 0 ? POSITIONS[boundaryIndex] : 0;
        const isFailed = firstFailureIndex >= 0;

        const passCount = run.levels.filter((l) => l.outcome === "completed").length;
        const failCount = run.levels.filter((l) => l.outcome === "failed").length;
        const totalDuration = run.levels.reduce((sum, l) => sum + (l.duration_s ?? 0), 0);
        const selected = run.run_id === selectedRunId;

        return (
          <div
            key={run.run_id}
            className={`axis__row${selected ? " axis__row--selected" : ""}`}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={`Select ${run.agent_name}`}
            onClick={() => onSelect(run.run_id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(run.run_id);
              }
            }}
          >
            <div className="axis__runner">
              <div className="axis__runner-top">
                <span className="axis__runner-name">{run.agent_name}</span>
                <button
                  className="axis__dismiss"
                  title={`Remove ${run.agent_name} from the board`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(run.run_id);
                  }}
                >
                  ×
                </button>
              </div>
              <span className="axis__runner-stats">
                <strong>{passCount}</strong> passed
                <strong className="axis__runner-stats-fail">{failCount}</strong> failed
                <span>
                  {run.levels.length}/{LADDER_LEVELS.length} attempted
                </span>
                <span>{totalDuration.toFixed(1)}s total</span>
              </span>
            </div>

            <div className="axis__track">
              <div className="axis__rail" />
              <div className="axis__rail-fill" style={{ width: `${filledPercent}%` }} />
              {isFailed && (
                <span
                  className="axis__break"
                  style={{ left: `${filledPercent}%` }}
                  title={`View ${run.agent_name}'s failure`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(run.run_id);
                  }}
                />
              )}
              {LADDER_LEVELS.map((level, i) => (
                <span
                  key={level}
                  className={`axis__node axis__node--${stages[i]}`}
                  style={{ left: `${POSITIONS[i]}%` }}
                >
                  {badgeFor(stages[i], level)}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

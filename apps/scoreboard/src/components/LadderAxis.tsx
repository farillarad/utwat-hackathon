import type { LevelResult } from "@shared/schema/run";
import { ladderScore, LADDER_LEVELS, type RunState } from "../ws/useRunStream";
import { runLabel } from "../lib/runLabel";
import { useCountUp } from "../lib/useCountUp";

const MAX_SCORE = LADDER_LEVELS.length * 10;

// Fixed, equal-width columns — not duration-scaled — because rows must share
// one scale for the comparison to work: run A dying at L5 vs. run B stalling
// at L2 has to read as literally different positions on the same axis.
// Inset a few percent on each side so the end stations' nodes/labels/glow
// never touch the container edge (was clipping at L6 before this margin).
const AXIS_MARGIN = 4;
const POSITIONS = LADDER_LEVELS.map(
  (_, i) => AXIS_MARGIN + (i / (LADDER_LEVELS.length - 1)) * (100 - 2 * AXIS_MARGIN)
);

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

interface RowProps {
  run: RunState;
  label: string;
  selected: boolean;
  isLeader: boolean;
  showLeader: boolean;
  onSelect: () => void;
  onDismiss: () => void;
}

function AxisRow({ run, label, selected, isLeader, showLeader, onSelect, onDismiss }: RowProps) {
  const byLevel = new Map(run.levels.map((l) => [l.level, l]));
  const currentLevel = run.ended ? null : run.current_level;
  const stages = LADDER_LEVELS.map((level) => stageFor(level, byLevel.get(level), currentLevel));
  const firstFailureIndex = stages.indexOf("fail");
  const reachedIndex = LADDER_LEVELS.reduce((acc, level, i) => (byLevel.has(level) ? i : acc), -1);
  const boundaryIndex = firstFailureIndex >= 0 ? firstFailureIndex : reachedIndex;
  const filledPercent = boundaryIndex >= 0 ? POSITIONS[boundaryIndex] : AXIS_MARGIN;
  const isFailed = firstFailureIndex >= 0;
  // Ended without failing but never reached the last level — distinct from
  // "still running, hasn't gotten there yet" (which keeps the plain dashed
  // look) and from "failed" (the severance marker below).
  const isStopped = run.ended && !isFailed && reachedIndex < LADDER_LEVELS.length - 1;

  const { score, highest, penalty } = ladderScore(run.levels);
  const shownScore = useCountUp(score);
  const passCount = run.levels.filter((l) => l.outcome === "completed").length;
  const failCount = run.levels.filter((l) => l.outcome === "failed").length;
  const totalDuration = run.levels.reduce((sum, l) => sum + (l.duration_s ?? 0), 0);

  return (
    <div
      className={`axis__row${selected ? " axis__row--selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Select ${label}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="axis__runner">
        <div className="axis__runner-top">
          <span className="axis__runner-name">
            {showLeader && isLeader && (
              <span className="axis__leader" title="Leading run">
                ★
              </span>
            )}
            {label}
          </span>
          <button
            className="axis__dismiss"
            title={`Remove ${label} from the board`}
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
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

      <div className="axis__score">
        <span className="axis__score-value">
          {shownScore}
          <span className="axis__score-max">/{MAX_SCORE}</span>
        </span>
        <span className="axis__score-detail">
          {highest > 0 ? `L${highest} × 10` : "—"}
          {penalty > 0 && ` −${penalty}`}
        </span>
      </div>

      <div className="axis__track">
        <div className="axis__rail" />
        <div className="axis__rail-fill" style={{ width: `${filledPercent}%` }} />
        {isFailed && (
          <span
            className={`axis__break${selected ? " axis__break--selected" : ""}`}
            style={{ left: `${filledPercent}%` }}
            title={`View ${label}'s failure`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
          />
        )}
        {isStopped && (
          <span className="axis__endcap" style={{ left: `${filledPercent}%` }} title="Run stopped without failing">
            <span className="axis__endcap-label">stopped</span>
          </span>
        )}
        {LADDER_LEVELS.map((level, i) => {
          // Only the selected run's failure gets full saturation + glow —
          // everything else stays flat so exactly one marker reads as "this
          // is the one to look at."
          const modifier = stages[i] === "fail" && !selected ? "fail-dim" : stages[i];
          return (
            <span
              key={level}
              className={`axis__node axis__node--${modifier}`}
              style={{ left: `${POSITIONS[i]}%` }}
            >
              {badgeFor(stages[i], level)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

interface Props {
  runs: RunState[];
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
  onDismiss: (runId: string) => void;
}

// One shared axis for every run instead of one illegible thumbnail rail per
// run. Levels 1-6 are fixed, equal-width columns; every run is plotted as a
// row against that same scale. Solid through passed levels, a hard severance
// marker at the first failure (full saturation only when that row is
// selected), dashed/dim beyond it.
export default function LadderAxis({ runs, selectedRunId, onSelect, onDismiss }: Props) {
  const topScore = runs.reduce((best, r) => Math.max(best, ladderScore(r.levels).score), 0);

  return (
    <div className="axis">
      <div className="axis__header">
        <span className="axis__runner-col" aria-hidden />
        <span className="axis__score-col" aria-hidden />
        <div className="axis__track axis__track--header">
          {LADDER_LEVELS.map((level, i) => (
            <span key={level} className="axis__col-label" style={{ left: `${POSITIONS[i]}%` }}>
              L{level}
            </span>
          ))}
        </div>
      </div>

      {runs.map((run) => (
        <AxisRow
          key={run.run_id}
          run={run}
          label={runLabel(run, runs)}
          selected={run.run_id === selectedRunId}
          isLeader={ladderScore(run.levels).score === topScore && topScore > 0}
          showLeader={runs.length > 1}
          onSelect={() => onSelect(run.run_id)}
          onDismiss={() => onDismiss(run.run_id)}
        />
      ))}
    </div>
  );
}

import { useMemo, useRef } from "react";
import type { LevelResult } from "@shared/schema/run";
import { ladderScore, LADDER_LEVELS, type RunState } from "../ws/useRunStream";
import { runLabel } from "../lib/runLabel";
import { useCountUp } from "../lib/useCountUp";
import { useJustChanged } from "../lib/useJustChanged";
import { useFlip } from "../lib/useFlip";
import { useReducedMotion } from "../lib/useReducedMotion";
import type { ReplayState } from "../lib/useReplay";

const MAX_SCORE = LADDER_LEVELS.length * 10;

// Fixed, equal-width columns — not duration-scaled — because rows must share
// one scale for the comparison to work: run A dying at L5 vs. run B stalling
// at L2 has to read as literally different positions on the same axis. (The
// traversal pip's *speed* between columns is what encodes duration — see
// useReplay — the columns themselves never move.)
const AXIS_MARGIN = 4;
export const AXIS_POSITIONS = LADDER_LEVELS.map(
  (_, i) => AXIS_MARGIN + (i / (LADDER_LEVELS.length - 1)) * (100 - 2 * AXIS_MARGIN)
);

// Minor tick at the midpoint between each pair of adjacent major (level)
// positions — a measurement-scale detail on the header ruler only, not
// repeated on every row (that would just be noise).
const MINOR_TICK_POSITIONS = AXIS_POSITIONS.slice(0, -1).map((p, i) => (p + AXIS_POSITIONS[i + 1]) / 2);

const FLARE_MS = 500;
const SHAKE_MS = 400;
const CURRENT_ENTER_MS = 400;

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
  topScore: number;
  replay: ReplayState | null;
  reducedMotion: boolean;
  onSelect: () => void;
  onDismiss: () => void;
}

function AxisRow({
  run,
  label,
  selected,
  isLeader,
  showLeader,
  topScore,
  replay,
  reducedMotion,
  onSelect,
  onDismiss,
}: RowProps) {
  const byLevel = new Map(run.levels.map((l) => [l.level, l]));
  const currentLevel = run.ended ? null : run.current_level;
  const stages = LADDER_LEVELS.map((level) => stageFor(level, byLevel.get(level), currentLevel));
  const firstFailureIndex = stages.indexOf("fail");
  const reachedIndex = LADDER_LEVELS.reduce((acc, level, i) => (byLevel.has(level) ? i : acc), -1);
  const boundaryIndex = firstFailureIndex >= 0 ? firstFailureIndex : reachedIndex;
  const filledPercent = boundaryIndex >= 0 ? AXIS_POSITIONS[boundaryIndex] : AXIS_MARGIN;
  const isFailed = firstFailureIndex >= 0;
  const isStopped = run.ended && !isFailed && reachedIndex < LADDER_LEVELS.length - 1;

  // One-shot transitions, not loops: a row flares+shakes the instant it
  // becomes a failure, and never again while it stays failed.
  const justFailed = useJustChanged(isFailed, FLARE_MS, (v) => v === true);
  const justFailedShake = useJustChanged(isFailed, SHAKE_MS, (v) => v === true);
  const justEnteredCurrent = useJustChanged(currentLevel ?? -1, CURRENT_ENTER_MS, (v) => v !== -1);

  const { score, highest, penalty } = ladderScore(run.levels);
  const shownScore = useCountUp(score, 400);
  const passCount = run.levels.filter((l) => l.outcome === "completed").length;
  const failCount = run.levels.filter((l) => l.outcome === "failed").length;
  const totalDuration = run.levels.reduce((sum, l) => sum + (l.duration_s ?? 0), 0);
  const delta = score - topScore;

  // Only render the pip once replay has actually been engaged — otherwise
  // it'd sit motionless at the start as a static idle marker whenever this
  // row is simply selected, which is exactly the ambient decoration this
  // pass is supposed to avoid. Suppressed outright under reduced motion:
  // useReplay jumps its reported currentTime straight to the end there
  // (so the controls read as "already finished" rather than stuck), which
  // would otherwise leave the pip sitting at rest for no reason once the
  // playback controls are already disabled.
  const isReplaying = !reducedMotion && selected && replay !== null && (replay.isPlaying || replay.currentTime > 0);
  const pipAtEnd = isReplaying && replay!.atEnd;

  // A caliper spanning the failed level's own column, labeled with that
  // level's duration — only for the selected run, so it doesn't turn into
  // clutter across every failed row on the board.
  const failedResult = isFailed ? byLevel.get(LADDER_LEVELS[firstFailureIndex]) : undefined;
  const showCaliper = selected && isFailed && firstFailureIndex > 0;
  const caliperStart = showCaliper ? AXIS_POSITIONS[firstFailureIndex - 1] : 0;
  const caliperEnd = showCaliper ? AXIS_POSITIONS[firstFailureIndex] : 0;

  return (
    // FLIP (reorder) drives this element's transform imperatively; the shake
    // below lives on an inner wrapper instead of here so the two transforms
    // never fight over the same element.
    <div
      data-flip-key={run.run_id}
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
      <div className={`axis__row-inner${!reducedMotion && justFailedShake ? " axis__row-inner--shake" : ""}`}>
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
          <span className="axis__runner-id">
            #{run.run_id.slice(0, 6)} · {run.events.length} evt
          </span>
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
          {showLeader && (
            <span className={`axis__score-delta${isLeader ? " axis__score-delta--lead" : ""}`}>
              {isLeader ? "leader" : `${delta} vs leader`}
            </span>
          )}
        </div>

        <div className="axis__track">
          <div className="axis__rail" />
          <div className="axis__rail-fill" style={{ width: `${filledPercent}%` }} />
          {showCaliper && (
            <div
              className="axis__caliper"
              style={{ left: `${caliperStart}%`, width: `${caliperEnd - caliperStart}%` }}
            >
              <span className="axis__caliper-tick axis__caliper-tick--start" />
              <span className="axis__caliper-tick axis__caliper-tick--end" />
              <span className="axis__caliper-label">{(failedResult?.duration_s ?? 0).toFixed(1)}s</span>
            </div>
          )}
          {isFailed && (
            <span
              className={`axis__break${selected ? " axis__break--selected" : ""}${
                !reducedMotion && justFailed ? " axis__break--flare" : ""
              }`}
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
          {isReplaying && (
            <span
              className={`axis__pip${pipAtEnd && isFailed ? " axis__pip--flare" : ""}${
                pipAtEnd && isStopped ? " axis__pip--fade" : ""
              }`}
              style={{ left: `${replay!.pipPercent}%` }}
            />
          )}
          {LADDER_LEVELS.map((level, i) => {
            // Only the selected run's failure gets full saturation + glow —
            // everything else stays flat so exactly one marker reads as
            // "this is the one to look at."
            const modifier = stages[i] === "fail" && !selected ? "fail-dim" : stages[i];
            const isThisCurrent = stages[i] === "current";
            return (
              <span
                key={level}
                className={`axis__node axis__node--${modifier}${
                  !reducedMotion && isThisCurrent && justEnteredCurrent ? " axis__node--current-enter" : ""
                }`}
                style={{ left: `${AXIS_POSITIONS[i]}%` }}
              >
                {badgeFor(stages[i], level)}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface Props {
  runs: RunState[];
  selectedRunId: string | null;
  replay: ReplayState | null;
  onSelect: (runId: string) => void;
  onDismiss: (runId: string) => void;
}

// One shared axis for every run instead of one illegible thumbnail rail per
// run. Levels 1-6 are fixed, equal-width columns; every run is plotted as a
// row against that same scale, ordered leader-first — rows FLIP-animate to
// their new position when that order changes instead of snapping.
export default function LadderAxis({ runs, selectedRunId, replay, onSelect, onDismiss }: Props) {
  const reducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () => [...runs].sort((a, b) => ladderScore(b.levels).score - ladderScore(a.levels).score || a.run_id.localeCompare(b.run_id)),
    [runs]
  );
  const orderKey = sorted.map((r) => r.run_id).join(",");
  useFlip(containerRef, orderKey, reducedMotion);

  const topScore = sorted.reduce((best, r) => Math.max(best, ladderScore(r.levels).score), 0);

  return (
    <div className="axis panel panel--frame panel--chamfer" ref={containerRef}>
      <div className="axis__title rule-label">
        <span>Run progress</span>
      </div>
      <div className="axis__header">
        <span className="axis__runner-col" aria-hidden />
        <span className="axis__score-col" aria-hidden />
        <div className="axis__track axis__track--header">
          {MINOR_TICK_POSITIONS.map((pos, i) => (
            <span key={`minor-${i}`} className="axis__tick axis__tick--minor" style={{ left: `${pos}%` }} />
          ))}
          {LADDER_LEVELS.map((level, i) => (
            <span key={level} className="axis__tick axis__tick--major" style={{ left: `${AXIS_POSITIONS[i]}%` }} />
          ))}
          {LADDER_LEVELS.map((level, i) => (
            <span key={level} className="axis__col-label" style={{ left: `${AXIS_POSITIONS[i]}%` }}>
              L{level}
            </span>
          ))}
        </div>
      </div>

      {sorted.map((run) => (
        <AxisRow
          key={run.run_id}
          run={run}
          label={runLabel(run, runs)}
          selected={run.run_id === selectedRunId}
          isLeader={ladderScore(run.levels).score === topScore && topScore > 0}
          showLeader={runs.length > 1}
          topScore={topScore}
          replay={run.run_id === selectedRunId ? replay : null}
          reducedMotion={reducedMotion}
          onSelect={() => onSelect(run.run_id)}
          onDismiss={() => onDismiss(run.run_id)}
        />
      ))}
    </div>
  );
}

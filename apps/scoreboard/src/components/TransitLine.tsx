import type { LevelResult } from "@shared/schema/run";
import { LADDER_LEVELS } from "../ws/useRunStream";

const LEVEL_NAMES: Record<number, string> = {
  1: "Baseline",
  2: "Distractors",
  3: "Decoy buttons",
  4: "DOM shift",
  5: "Silent failure",
  6: "Injection",
};

// Floor so a level with duration_s === 0 (not attempted yet) doesn't collapse
// its segment to nothing — once a level completes, its real duration stretches
// the line between stations instead of every segment being equal-length.
const MIN_SEGMENT_S = 0.4;

type Stage = "pass" | "fail" | "current" | "locked";

interface Props {
  levels: LevelResult[];
  currentLevel: number | null;
}

function stageFor(level: number, result: LevelResult | undefined, currentLevel: number | null): Stage {
  if (result) return result.outcome === "completed" ? "pass" : "fail";
  return level === currentLevel ? "current" : "locked";
}

function badgeFor(stage: Stage, level: number) {
  if (stage === "pass") return "✓";
  if (stage === "fail") return "✕";
  return level;
}

// Same station data as the ladder it replaces, laid out as a single horizontal
// transit line instead of a vertical enumeration: a run is strictly sequential,
// so passed segments render solid, the first failure severs the line hard, and
// everything beyond it is dashed and dim (unreached). Station spacing encodes
// each level's duration_s where it's known.
export default function TransitLine({ levels, currentLevel }: Props) {
  const byLevel = new Map(levels.map((l) => [l.level, l]));
  const stages = LADDER_LEVELS.map((level) => stageFor(level, byLevel.get(level), currentLevel));
  const firstFailureIndex = stages.indexOf("fail");
  const reachedIndex = LADDER_LEVELS.reduce((acc, level, i) => (byLevel.has(level) ? i : acc), -1);

  const segLen = LADDER_LEVELS.map((level) => Math.max(byLevel.get(level)?.duration_s ?? 0, MIN_SEGMENT_S));
  const cumulative: number[] = [];
  let running = 0;
  for (let i = 0; i < LADDER_LEVELS.length; i++) {
    if (i > 0) running += segLen[i];
    cumulative.push(running);
  }
  const total = cumulative[cumulative.length - 1] || 1;
  const positions = cumulative.map((c) => (c / total) * 100);

  const boundaryIndex = firstFailureIndex >= 0 ? firstFailureIndex : reachedIndex;
  const filledPercent = boundaryIndex >= 0 ? positions[boundaryIndex] : 0;
  const isStoppedAtFailure = firstFailureIndex >= 0;

  return (
    <div className="transit" aria-label="Run progress">
      <div className="transit-track">
        <div className="transit-rail" />
        <div className="transit-rail-fill" style={{ width: `${filledPercent}%` }} />
        {isStoppedAtFailure && (
          <div className="transit-break" style={{ left: `${filledPercent}%` }} aria-hidden />
        )}
        <div
          className={`transit-pip${isStoppedAtFailure ? " transit-pip-fail" : ""}`}
          style={{ left: `${filledPercent}%` }}
        />
        {LADDER_LEVELS.map((level, i) => {
          const result = byLevel.get(level);
          return (
            <div
              key={level}
              className={`transit-station transit-station-${stages[i]}`}
              style={{ left: `${positions[i]}%` }}
              title={`Level ${level} — ${LEVEL_NAMES[level]}`}
            >
              <span className="transit-node">{badgeFor(stages[i], level)}</span>
              <span className="transit-tick">L{level}</span>
              {result?.duration_s ? <span className="transit-time">{result.duration_s.toFixed(1)}s</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

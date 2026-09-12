import type { LevelResult } from "@shared/schema/run";

const LEVELS = [1, 2, 3, 4, 5, 6];
export const LEVEL_COUNT = LEVELS.length;

// Floor so a level with duration_s === 0 (currently always true — see
// server/src/routes/runs.ts TODO) doesn't collapse its segment to nothing.
// Once duration is populated server-side, longer levels will visibly stretch
// the line between stations instead of every segment being equal-length.
const MIN_SEGMENT_S = 0.4;

type Stage = "pass" | "fail" | "locked";

function stageFor(result: LevelResult | undefined): Stage {
  if (!result) return "locked";
  return result.outcome === "completed" ? "pass" : "fail";
}

function badgeFor(stage: Stage, level: number) {
  if (stage === "pass") return "✓";
  if (stage === "fail") return "✕";
  return level;
}

// A single horizontal transit line: levels are stations left to right. A run
// is strictly sequential, so the line renders that directly — solid up to the
// last reached station, severed hard at the first failure, dashed and dim for
// anything beyond (unreached). Station spacing encodes each level's duration_s
// where that data exists; derived entirely from the `levels` prop, same as
// the ladder it replaces.
export default function TransitLine({ levels }: { levels: LevelResult[] }) {
  const byLevel = new Map(levels.map((l) => [l.level, l]));
  const stages = LEVELS.map((level) => stageFor(byLevel.get(level)));
  const firstFailureIndex = stages.indexOf("fail");
  const reachedIndex = LEVELS.reduce((acc, level, i) => (byLevel.has(level) ? i : acc), -1);

  const segLen = LEVELS.map((level) => Math.max(byLevel.get(level)?.duration_s ?? 0, MIN_SEGMENT_S));
  const cumulative: number[] = [];
  let running = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (i > 0) running += segLen[i];
    cumulative.push(running);
  }
  const total = cumulative[cumulative.length - 1] || 1;
  const positions = cumulative.map((c) => (c / total) * 100);

  const boundaryIndex = firstFailureIndex >= 0 ? firstFailureIndex : reachedIndex;
  const filledPercent = boundaryIndex >= 0 ? positions[boundaryIndex] : 0;
  const isStoppedAtFailure = firstFailureIndex >= 0;

  return (
    <div className="transit">
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
        {LEVELS.map((level, i) => (
          <div key={level} className={`transit-station transit-station-${stages[i]}`} style={{ left: `${positions[i]}%` }}>
            <span className="transit-node">{badgeFor(stages[i], level)}</span>
            <span className="transit-tick">L{level}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

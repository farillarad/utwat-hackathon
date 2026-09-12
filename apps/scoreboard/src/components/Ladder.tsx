import { useEffect, useRef, useState } from "react";
import type { LevelResult } from "@shared/schema/run";

const LEVELS = [1, 2, 3, 4, 5, 6];
const FLASH_MS = 700;

type Stage = "locked" | "current" | "pass" | "fail";

function stageFor(level: number, result: LevelResult | undefined, currentLevel: number | null): Stage {
  if (result) return result.outcome === "completed" ? "pass" : "fail";
  return level === currentLevel ? "current" : "locked";
}

function badgeContent(stage: Stage, level: number) {
  if (stage === "pass") return "✓";
  if (stage === "fail") return "✕";
  return level;
}

// Briefly flags a rung as "just changed" so a status swap gets a glow/scale
// transition instead of an instant class swap. Purely presentational — derives
// entirely from the same `levels` prop already used to render the ladder, and
// never feeds back into scoring or data flow.
function useJustChanged(stages: Stage[]) {
  const stageKey = stages.join(",");
  const prevRef = useRef<Stage[] | null>(null);
  const [flashing, setFlashing] = useState<Set<number>>(new Set());

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = stages;
    if (!prev) return; // don't flash on first mount
    const changed = LEVELS.filter((_, i) => prev[i] !== stages[i]);
    if (!changed.length) return;
    setFlashing((f) => new Set([...f, ...changed]));
    const timer = setTimeout(() => {
      setFlashing((f) => {
        const next = new Set(f);
        changed.forEach((level) => next.delete(level));
        return next;
      });
    }, FLASH_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageKey]);

  return flashing;
}

export default function Ladder({ levels }: { levels: LevelResult[] }) {
  const highestSeen = levels.reduce((max, l) => Math.max(max, l.level), 0);
  const currentLevel = highestSeen < 6 ? highestSeen + 1 : null;
  const stages = LEVELS.map((level) => stageFor(level, levels.find((l) => l.level === level), currentLevel));
  const flashing = useJustChanged(stages);

  return (
    <ol className="ladder">
      {LEVELS.map((level, i) => {
        const result = levels.find((l) => l.level === level);
        const stage = stages[i];
        const selfReport = result?.agent_self_report;
        const selfReportMismatch =
          result && selfReport !== null && selfReport !== undefined
            ? selfReport !== (result.outcome === "completed")
            : false;

        return (
          <li
            key={level}
            className={`rung rung-${stage}${flashing.has(level) ? " rung-flash" : ""}`}
          >
            <span className="rung-badge">{badgeContent(stage, level)}</span>
            <span className="rung-level">Level {level}</span>
            {result && <span className="failure-mode">{result.failure_mode ?? result.outcome}</span>}
            {result && selfReport !== null && selfReport !== undefined && (
              <span className={`self-report ${selfReportMismatch ? "self-report-mismatch" : ""}`}>
                agent believed: {selfReport ? "succeeded" : "failed"}
                {selfReportMismatch ? " (wrong)" : ""}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

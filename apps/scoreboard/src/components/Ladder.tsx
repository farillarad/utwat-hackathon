import type { LevelResult } from "@shared/schema/run";
import { LADDER_LEVELS } from "../ws/useRunStream";
import { label } from "./RunLane";

const LEVEL_NAMES: Record<number, string> = {
  1: "Baseline",
  2: "Distractors",
  3: "Decoy buttons",
  4: "DOM shift",
  5: "Silent failure",
  6: "Injection",
};

interface Props {
  levels: LevelResult[];
  currentLevel: number | null;
}

// The rail: level 6 at the top, level 1 at the bottom, so the agent visibly climbs.
export default function Ladder({ levels, currentLevel }: Props) {
  const byLevel = new Map(levels.map((l) => [l.level, l]));

  return (
    <ol className="rail" aria-label="Ladder">
      {[...LADDER_LEVELS].reverse().map((n) => {
        const result = byLevel.get(n);
        const status = result ? result.outcome : currentLevel === n ? "current" : "pending";
        return (
          <li key={n} className={`rung rung--${status}`} aria-current={status === "current" ? "step" : undefined}>
            <span className="rung__num">{n}</span>
            <span className="rung__name">{LEVEL_NAMES[n]}</span>
            <span className="rung__meta">
              {result && (
                <>
                  {result.duration_s > 0 && <span className="rung__time">{result.duration_s.toFixed(1)}s</span>}
                  {result.retries > 0 && <span className="rung__retries">+{result.retries}</span>}
                </>
              )}
              {status === "current" && <span className="rung__marker" aria-label="Agent is here" />}
            </span>
            {result?.failure_mode && (
              <span className={`stamp tag--${result.failure_mode}`}>{label(result.failure_mode)}</span>
            )}
            {result && typeof result.agent_self_report === "boolean" && (
              <span
                className={`stamp belief ${
                  result.agent_self_report !== (result.outcome === "completed") ? "belief--wrong" : "belief--right"
                }`}
              >
                agent believed: {result.agent_self_report ? "succeeded" : "failed"}
                {result.agent_self_report !== (result.outcome === "completed") && " — wrong"}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

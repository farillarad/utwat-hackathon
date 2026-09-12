import { useEffect, useRef, useState } from "react";
import AgentView from "./AgentView";
import TransitLine from "./TransitLine";
import FailureHero from "./FailureHero";
import TraceLog from "./TraceLog";
import { ladderScore, LADDER_LEVELS, type RunState } from "../ws/useRunStream";

const MAX_SCORE = LADDER_LEVELS.length * 10;

interface Props {
  run: RunState;
  onDismiss: () => void;
}

// Counts the displayed score up (or down) to its new value instead of snapping —
// display only; the score itself comes from ladderScore(). (Tanay's touch.)
function useCountUp(value: number, duration = 500) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return display;
}

export default function RunLane({ run, onDismiss }: Props) {
  const { score, highest, penalty } = ladderScore(run.levels);
  const shownScore = useCountUp(score);
  const failed = run.levels.find((l) => l.outcome === "failed" && l.level > highest);
  const passCount = run.levels.filter((l) => l.outcome === "completed").length;
  const failCount = run.levels.filter((l) => l.outcome === "failed").length;
  const totalDuration = run.levels.reduce((sum, l) => sum + (l.duration_s ?? 0), 0);

  return (
    <section className={`lane ${run.ended ? "lane--ended" : ""}`} aria-label={`Run for ${run.agent_name}`}>
      <header className="lane__head">
        <div>
          <span className="lane__eyebrow">{run.ended ? "Run finished" : "Running"}</span>
          <h2 className="lane__agent">{run.agent_name}</h2>
          <div className="lane__stats">
            <span>
              <strong>{passCount}</strong> passed
            </span>
            <span className="lane__stats-fail">
              <strong>{failCount}</strong> failed
            </span>
            <span>
              <strong>{run.levels.length}</strong>/{LADDER_LEVELS.length} attempted
            </span>
            <span>
              <strong>{totalDuration.toFixed(1)}s</strong> total
            </span>
          </div>
        </div>
        <div className="score">
          <span className="score__label">Ladder score</span>
          <span className="score__value">
            {shownScore}
            <span className="score__max">/{MAX_SCORE}</span>
          </span>
          <span className="score__detail">
            {highest > 0 ? `L${highest} × 10` : "no level passed"}
            {penalty > 0 && ` − ${penalty} retr${penalty === 1 ? "y" : "ies"}`}
          </span>
        </div>
        <button className="btn btn--quiet" onClick={onDismiss} title="Remove this run from the board">
          Dismiss
        </button>
      </header>

      <div className="lane__body">
        <div className="lane__left">
          <AgentView frame={run.frame} ended={run.ended} />
          {failed && <FailureHero result={failed} events={run.events} />}
        </div>
        <div className="lane__right">
          <TransitLine levels={run.levels} currentLevel={run.ended ? null : run.current_level} />
          <TraceLog events={run.events} />
        </div>
      </div>
    </section>
  );
}

export function label(mode: string) {
  return mode.replace(/_/g, " ");
}

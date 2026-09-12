import { useEffect, useRef, useState } from "react";
import { ladderScore, LADDER_LEVELS, type RunState } from "../ws/useRunStream";

const MAX_SCORE = LADDER_LEVELS.length * 10;

// Counts a displayed score up (or down) to its new value instead of snapping.
// Display only — the score itself still comes from ladderScore().
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

interface RowProps {
  run: RunState;
  selected: boolean;
  showDelta: boolean;
  delta: number;
  onSelect: () => void;
  score: number;
  highest: number;
  penalty: number;
}

function ScoreRow({ run, selected, showDelta, delta, onSelect, score, highest, penalty }: RowProps) {
  const shown = useCountUp(score);
  return (
    <button
      className={`cscore__row${selected ? " cscore__row--selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="cscore__name">{run.agent_name}</span>
      <span className="cscore__value">
        {shown}
        <span className="cscore__max">/{MAX_SCORE}</span>
      </span>
      <span className="cscore__detail">
        {highest > 0 ? `L${highest} × 10` : "no level passed"}
        {penalty > 0 && ` − ${penalty} retr${penalty === 1 ? "y" : "ies"}`}
      </span>
      {showDelta && (
        <span className={`cscore__delta${delta === 0 ? " cscore__delta--lead" : ""}`}>
          {delta === 0 ? "leader" : `${delta} vs leader`}
        </span>
      )}
    </button>
  );
}

interface Props {
  runs: RunState[];
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
}

// One comparative readout instead of one score box per run: every run's score
// against the same maximum, plus how far behind the leader each one is.
export default function ComparativeScore({ runs, selectedRunId, onSelect }: Props) {
  const scored = runs.map((run) => ({ run, ...ladderScore(run.levels) }));
  const top = scored.reduce((best, s) => Math.max(best, s.score), 0);

  return (
    <div className="cscore" role="list" aria-label="Ladder scores">
      {scored.map(({ run, score, highest, penalty }) => (
        <ScoreRow
          key={run.run_id}
          run={run}
          score={score}
          highest={highest}
          penalty={penalty}
          selected={run.run_id === selectedRunId}
          showDelta={runs.length > 1}
          delta={score - top}
          onSelect={() => onSelect(run.run_id)}
        />
      ))}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import TransitLine, { LEVEL_COUNT } from "./components/TransitLine";
import FailureHero from "./components/FailureHero";
import AgentPanel from "./components/AgentPanel";
import TraceLog from "./components/TraceLog";
import { useRunStream } from "./ws/useRunStream";

// Ladder Score per PRD §10: highest level cleanly completed x10, minus a
// per-level-capped retry penalty summed across completed levels.
function ladderScore(levels: { level: number; outcome: string; retries?: number }[]) {
  const completed = levels.filter((l) => l.outcome === "completed");
  const highest = completed.reduce((max, l) => Math.max(max, l.level), 0);
  const retryPenalty = completed.reduce((sum, l) => sum + Math.min(5, l.retries ?? 0), 0);
  return highest * 10 - retryPenalty;
}

// Animates the displayed score counting up (or down) to a new value instead of
// snapping instantly. Purely a display effect — the score itself is still
// computed by ladderScore() above with no change to that logic.
function useCountUp(value: number, duration = 500) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (value - from) * eased);
      setDisplay(next);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return display;
}

export default function App() {
  const { levels, events } = useRunStream();
  const score = useCountUp(ladderScore(levels));
  const maxScore = LEVEL_COUNT * 10;

  const passCount = levels.filter((l) => l.outcome === "completed").length;
  const failCount = levels.filter((l) => l.outcome === "failed").length;
  const totalDuration = levels.reduce((sum, l) => sum + (l.duration_s ?? 0), 0);
  const failureModeCounts = levels.reduce<Record<string, number>>((acc, l) => {
    if (l.failure_mode) acc[l.failure_mode] = (acc[l.failure_mode] ?? 0) + 1;
    return acc;
  }, {});
  const firstFailure = levels.find((l) => l.outcome === "failed");

  return (
    <div className="scoreboard">
      <header className="scoreboard-header">
        <div>
          <div className="scoreboard-kicker">Agent Stress-Test</div>
          <div className="scoreboard-title">Gauntlet</div>
        </div>
        <div className="score-block">
          <div className="score-label">Ladder Score</div>
          <div className="score-value">
            {score}
            <span className="score-max">/{maxScore}</span>
          </div>
        </div>
      </header>

      <div className="stats-strip">
        <div className="stat">
          <span className="stat-value">{passCount}</span>
          <span className="stat-label">Passed</span>
        </div>
        <div className="stat stat-danger">
          <span className="stat-value">{failCount}</span>
          <span className="stat-label">Failed</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {levels.length}/{LEVEL_COUNT}
          </span>
          <span className="stat-label">Attempted</span>
        </div>
        <div className="stat">
          <span className="stat-value">{totalDuration.toFixed(1)}s</span>
          <span className="stat-label">Total Time</span>
        </div>
        {Object.entries(failureModeCounts).map(([mode, count]) => (
          <div className="stat stat-tag" key={mode}>
            <span className="stat-value">{count}×</span>
            <span className="stat-label">{mode}</span>
          </div>
        ))}
      </div>

      <section className="panel transit-panel">
        <h2 className="panel-title">Run Progress</h2>
        <TransitLine levels={levels} />
      </section>

      {firstFailure && <FailureHero result={firstFailure} events={events} />}

      <div className="lower-grid">
        <section className="panel">
          <h2 className="panel-title">Agent</h2>
          <AgentPanel levels={levels} events={events} />
        </section>
        <section className="panel">
          <h2 className="panel-title">Trace</h2>
          <TraceLog events={events} />
        </section>
      </div>
    </div>
  );
}

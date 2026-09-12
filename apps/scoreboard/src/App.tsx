import { useEffect, useRef, useState } from "react";
import Ladder from "./components/Ladder";
import TraceLog from "./components/TraceLog";
import AgentView from "./components/AgentView";
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

  return (
    <div className="scoreboard">
      <header className="scoreboard-header">
        <div>
          <div className="scoreboard-title">
            Agent Stress-Test <span>Gauntlet</span>
          </div>
          <div className="scoreboard-subtitle">Live robustness profile</div>
        </div>
        <div>
          <div className="score-label">Ladder Score</div>
          <div className="score-value">{score}</div>
        </div>
      </header>
      <AgentView isLive={events.length > 0} />
      <div className="ladder-panel">
        <section className="panel">
          <h2 className="panel-title">Ladder</h2>
          <Ladder levels={levels} />
        </section>
        <section className="panel">
          <h2 className="panel-title">Trace</h2>
          <TraceLog events={events} />
        </section>
      </div>
    </div>
  );
}

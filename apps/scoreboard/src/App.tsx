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

export default function App() {
  const { levels, events } = useRunStream();

  return (
    <div className="scoreboard">
      <header className="scoreboard-header">
        <div>
          <div className="scoreboard-title">
            Agent Stress-Test <span>Gauntlet</span>
          </div>
          <div className="scoreboard-subtitle">Live robustness profile</div>
        </div>
        <div className="scoreboard-subtitle">Ladder Score: {ladderScore(levels)}</div>
      </header>
      <AgentView />
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

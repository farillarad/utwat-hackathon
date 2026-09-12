import ComparisonBoard from "./components/ComparisonBoard";
import { useRunStream } from "./ws/useRunStream";

const MAX_ROWS = 4;

export default function App() {
  const { runs, connection, dismiss, clearAll } = useRunStream();
  // Newest runs win the screen; older ones are still in memory and reappear when a row is dismissed.
  const visible = runs.slice(-MAX_ROWS);

  return (
    <div className="board">
      <header className="board__head">
        <div className="board__title">
          <span className="board__eyebrow">Agent stress-test</span>
          <h1>Gauntlet</h1>
        </div>
        <div className="board__status">
          <span className={`pill pill--${connection}`}>
            <i className="pill__dot" />
            {connection === "live" ? "Live feed" : connection === "connecting" ? "Connecting" : "Feed offline"}
          </span>
          <span className="board__count">
            {runs.length === 0 ? "No runs" : `${runs.length} run${runs.length === 1 ? "" : "s"}`}
          </span>
          {runs.length > 0 && (
            <button className="btn" onClick={clearAll}>
              Clear board
            </button>
          )}
        </div>
      </header>

      {visible.length === 0 ? (
        <section className="empty">
          <div className="empty__panel">
            <span className="empty__status">Standing by</span>
            <p className="empty__lead">Waiting for an agent to start a run.</p>
            <p className="empty__hint">
              Point an adapter at the gauntlet: <code>python agent-adapter/raw_llm_loop.py</code> or{" "}
              <code>python agent-adapter/browser_use_runner.py</code>. To replay a stored run:{" "}
              <code>npx tsx scripts/replay-run.ts data/runs/&lt;file&gt;.json</code>
            </p>
          </div>
        </section>
      ) : (
        <ComparisonBoard runs={visible} onDismiss={dismiss} />
      )}
    </div>
  );
}

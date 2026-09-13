import { useRef } from "react";
import ComparisonBoard from "./components/ComparisonBoard";
import { useRunStream } from "./ws/useRunStream";
import { useNow } from "./lib/useNow";
import Cockpit from "./components/Cockpit";

const MAX_ROWS = 4;

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function App() {
  return new URLSearchParams(window.location.search).get("view") === "legacy" ? <LegacyBoard /> : <Cockpit />;
}

function LegacyBoard() {
  const { runs, connection, dismiss, clearAll } = useRunStream();
  // Newest runs win the screen; older ones are still in memory and reappear when a row is dismissed.
  const visible = runs.slice(-MAX_ROWS);

  // Session-level silkscreen readouts — display only, computed from data
  // useRunStream already exposes; no new data flow.
  const mountedAtRef = useRef(Date.now());
  const sessionIdRef = useRef(Math.random().toString(36).slice(2, 7).toUpperCase());
  const now = useNow();
  const totalEvents = runs.reduce((sum, r) => sum + r.events.length, 0);

  return (
    <div className="board">
      <header className="board__head">
        <div className="board__title">
          <span className="board__eyebrow">Agent stress-test</span>
          <h1>Gauntlet</h1>
        </div>
        <div className="board__actions">
          {runs.length > 0 && (
            <button className="btn btn--quiet" onClick={clearAll}>
              Clear board
            </button>
          )}
        </div>
      </header>

      <div className="statusbar">
        <span className={`statusbar__seg statusbar__seg--${connection}`}>
          <span className="statusbar__dot" />
          <span className="statusbar__label">Feed</span>
          <span className="statusbar__value">
            {connection === "live" ? "live" : connection === "connecting" ? "connecting" : "offline"}
          </span>
        </span>
        <span className="statusbar__seg">
          <span className="statusbar__label">Runs</span>
          <span className="statusbar__value">{runs.length}</span>
        </span>
        <span className="statusbar__seg">
          <span className="statusbar__label">Events</span>
          <span className="statusbar__value">{totalEvents}</span>
        </span>
        <span className="statusbar__seg">
          <span className="statusbar__label">Session</span>
          <span className="statusbar__value">{formatDuration(now - mountedAtRef.current)}</span>
        </span>
        <span className="statusbar__seg">
          <span className="statusbar__label">Sid</span>
          <span className="statusbar__value">{sessionIdRef.current}</span>
        </span>
      </div>

      {visible.length === 0 ? (
        <section className="empty">
          <div className="empty__panel panel panel--frame panel--chamfer">
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

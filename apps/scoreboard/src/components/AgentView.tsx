// Owner: Amir — embed the agent's live browser view. Confirm feasibility (CDP frame
// stream vs. periodic screenshot polling) early; this is the highest-risk UI piece.
// The browser-chrome frame + empty state below are presentational scaffolding so
// this panel reads as "camera feed loading," not "broken," until the real feed lands.
export default function AgentView({ isLive = false }: { isLive?: boolean }) {
  return (
    <div className={`agent-view${isLive ? " agent-view-live" : ""}`}>
      <div className="agent-view-chrome">
        <span className="agent-view-dot" />
        <span className="agent-view-dot" />
        <span className="agent-view-dot" />
        <span className="agent-view-url">agent's browser — awaiting run</span>
        {isLive && (
          <span className="live-badge">
            <span className="live-dot" />
            LIVE
          </span>
        )}
      </div>
      <div className="agent-view-body">
        <div className="agent-view-empty">
          <span className="agent-view-radar">
            <span className="agent-view-radar-ring" />
            <span className="agent-view-radar-core" />
          </span>
          <p className="agent-view-empty-title">No signal</p>
          <p className="agent-view-empty-sub">Waiting for agent feed…</p>
        </div>
      </div>
    </div>
  );
}

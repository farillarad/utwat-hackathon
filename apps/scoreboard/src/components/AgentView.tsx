// Owner: Amir — embed the agent's live browser view. Confirm feasibility (CDP frame
// stream vs. periodic screenshot polling) early; this is the highest-risk UI piece.
// The browser-chrome frame + waiting state below are presentational scaffolding so
// this panel reads as "camera feed loading," not "broken," until the real feed lands.
export default function AgentView() {
  return (
    <div className="agent-view">
      <div className="agent-view-chrome">
        <span className="agent-view-dot" />
        <span className="agent-view-dot" />
        <span className="agent-view-dot" />
        <span className="agent-view-url">agent's browser — awaiting run</span>
      </div>
      <div className="agent-view-body">
        <span className="agent-view-pulse" />
        Waiting for agent feed…
      </div>
    </div>
  );
}

// Owner: Amir — embed the agent's live browser view. Confirm feasibility (CDP frame
// stream vs. periodic screenshot polling) early; this is the highest-risk UI piece.
export default function AgentView() {
  return (
    <div className="agent-view">
      <p>Agent live view placeholder</p>
    </div>
  );
}

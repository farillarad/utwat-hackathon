import Ladder from "./components/Ladder";
import TraceLog from "./components/TraceLog";
import AgentView from "./components/AgentView";
import { useRunStream } from "./ws/useRunStream";

export default function App() {
  const { levels, events } = useRunStream();

  return (
    <div className="scoreboard">
      <AgentView />
      <div className="ladder-panel">
        <Ladder levels={levels} />
        <TraceLog events={events} />
      </div>
    </div>
  );
}

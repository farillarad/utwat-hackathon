import AgentView from "./AgentView";
import Ladder from "./Ladder";
import TraceLog from "./TraceLog";
import { ladderScore, type RunState } from "../ws/useRunStream";

interface Props {
  run: RunState;
  onDismiss: () => void;
}

export default function RunLane({ run, onDismiss }: Props) {
  const { score, highest, penalty } = ladderScore(run.levels);
  const failed = run.levels.find((l) => l.outcome === "failed" && l.level > highest);

  return (
    <section className={`lane ${run.ended ? "lane--ended" : ""}`} aria-label={`Run for ${run.agent_name}`}>
      <header className="lane__head">
        <div>
          <span className="lane__eyebrow">{run.ended ? "Run finished" : "Running"}</span>
          <h2 className="lane__agent">{run.agent_name}</h2>
        </div>
        <div className="score">
          <span className="score__label">Ladder score</span>
          <span className="score__value">{score}</span>
          <span className="score__detail">
            {highest > 0 ? `L${highest} × 10` : "no level passed"}
            {penalty > 0 && ` − ${penalty} retr${penalty === 1 ? "y" : "ies"}`}
          </span>
        </div>
        <button className="btn btn--quiet" onClick={onDismiss} title="Remove this run from the board">
          Dismiss
        </button>
      </header>

      <div className="lane__body">
        <div className="lane__left">
          <AgentView frame={run.frame} ended={run.ended} />
          {failed && (
            <p className="lane__verdict">
              Broke on level {failed.level}
              {failed.failure_mode && (
                <>
                  {" — "}
                  <span className={`tag tag--${failed.failure_mode}`}>{label(failed.failure_mode)}</span>
                </>
              )}
            </p>
          )}
        </div>
        <div className="lane__right">
          <Ladder levels={run.levels} currentLevel={run.ended ? null : run.current_level} />
          <TraceLog events={run.events} />
        </div>
      </div>
    </section>
  );
}

export function label(mode: string) {
  return mode.replace(/_/g, " ");
}

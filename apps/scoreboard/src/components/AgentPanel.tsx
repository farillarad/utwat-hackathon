import type { LevelResult } from "@shared/schema/run";
import type { GauntletEvent } from "@shared/schema/events";

// Owner: Amir — eventually embeds the agent's live browser view (CDP frame
// stream or screenshot polling, still unconfirmed). Until that lands, this
// panel is a dense readout built from data already flowing into the
// scoreboard (levels/events) rather than a large placeholder void: last
// event + pass/fail tally while live, a compact standby summary when idle.
export default function AgentPanel({ levels, events }: { levels: LevelResult[]; events: GauntletEvent[] }) {
  const isLive = events.length > 0;
  const lastEvent = events[events.length - 1];
  const passCount = levels.filter((l) => l.outcome === "completed").length;
  const failCount = levels.filter((l) => l.outcome === "failed").length;

  return (
    <div className={`agent-panel${isLive ? " agent-panel-live" : ""}`}>
      <div className="agent-panel-chrome">
        <span className="agent-panel-dot" />
        <span className="agent-panel-dot" />
        <span className="agent-panel-dot" />
        <span className="agent-panel-url">agent&rsquo;s browser</span>
        {isLive && (
          <span className="live-badge">
            <span className="live-dot" />
            LIVE
          </span>
        )}
      </div>
      <div className="agent-panel-body">
        {isLive ? (
          <>
            <div className="agent-panel-readout">
              <span className="agent-panel-readout-label">Last event</span>
              <code className="agent-panel-readout-value">
                L{lastEvent.level} · {lastEvent.type} {lastEvent.target ?? ""}
              </code>
            </div>
            <div className="agent-panel-tally">
              <span className="tally-pass">{passCount} passed</span>
              <span className="tally-fail">{failCount} failed</span>
              <span className="tally-total">{events.length} events logged</span>
            </div>
          </>
        ) : (
          <div className="agent-panel-standby">
            <div className="agent-panel-standby-row">
              <span>Levels attempted</span>
              <strong>0 / 6</strong>
            </div>
            <div className="agent-panel-standby-row">
              <span>Last run</span>
              <strong>—</strong>
            </div>
            <div className="agent-panel-standby-row">
              <span>Status</span>
              <strong>Standing by</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

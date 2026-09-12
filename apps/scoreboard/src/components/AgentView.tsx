import type { FramePayload } from "@shared/schema/scoreboard";

// Live browser view. The adapter that owns the browser pushes ~1 fps JPEG frames to
// POST /api/runs/:id/frame; the server relays them here. This works for any agent
// (Browser Use, our raw loop) without CDP access from the scoreboard, and frames are
// stored server-side so replays show the same picture.
//
// There is exactly one of these on the board now, tied to whichever run is
// selected (see ComparisonBoard) — not one per run. When that run has no frame
// yet, `summary` renders its stats instead of a bare "waiting" placeholder.
export interface AgentSummary {
  agentName: string;
  passCount: number;
  failCount: number;
  attempted: number;
  totalLevels: number;
  score: number;
  maxScore: number;
  ended: boolean;
}

interface Props {
  frame: FramePayload | null;
  ended: boolean;
  summary?: AgentSummary | null;
}

export default function AgentView({ frame, ended, summary }: Props) {
  return (
    <figure className="browser">
      <figcaption className="browser__chrome">
        <span className="browser__dots" aria-hidden />
        <span className="browser__url">{frame?.url ?? summary?.agentName ?? "—"}</span>
        {frame && !ended && <span className="browser__live">live</span>}
      </figcaption>
      <div className="browser__viewport">
        {frame ? (
          <img src={`data:image/jpeg;base64,${frame.image}`} alt="Agent's browser" />
        ) : summary ? (
          <div className="browser__summary">
            <span className="browser__summary-status">{summary.ended ? "Run finished" : "No frame yet"}</span>
            <span className="browser__summary-score">
              {summary.score}
              <span className="browser__summary-max">/{summary.maxScore}</span>
            </span>
            <div className="browser__summary-stats">
              <span>
                <strong>{summary.passCount}</strong> passed
              </span>
              <span>
                <strong>{summary.failCount}</strong> failed
              </span>
              <span>
                {summary.attempted}/{summary.totalLevels} attempted
              </span>
            </div>
          </div>
        ) : (
          <p className="browser__empty">
            {ended ? "No frames were captured for this run." : "Waiting for the first frame from the agent…"}
          </p>
        )}
      </div>
    </figure>
  );
}

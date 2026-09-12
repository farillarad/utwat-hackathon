import type { FramePayload } from "@shared/schema/scoreboard";
import type { LevelResult } from "@shared/schema/run";
import { LADDER_LEVELS } from "../ws/useRunStream";

// Live browser view. The adapter that owns the browser pushes ~1 fps JPEG frames to
// POST /api/runs/:id/frame; the server relays them here. This works for any agent
// (Browser Use, our raw loop) without CDP access from the scoreboard, and frames are
// stored server-side so replays show the same picture.
//
// There is exactly one of these on the board now, tied to whichever run is
// selected (see ComparisonBoard) — not one per run. When that run has no frame
// yet, `summary` renders its per-level timing breakdown instead of leaving a
// bare "waiting" placeholder sitting in a tall empty box.
export interface AgentSummary {
  runName: string;
  score: number;
  maxScore: number;
  levels: LevelResult[];
}

interface Props {
  frame: FramePayload | null;
  ended: boolean;
  summary?: AgentSummary | null;
}

export default function AgentView({ frame, ended, summary }: Props) {
  return (
    <figure className="browser panel">
      <figcaption className="browser__chrome">
        <span className="browser__dots" aria-hidden />
        <span className="browser__url">{frame?.url ?? summary?.runName ?? "—"}</span>
        {frame && !ended && <span className="browser__live">live</span>}
      </figcaption>
      <div className={`browser__viewport${!frame && summary ? " browser__viewport--summary" : ""}`}>
        {frame ? (
          <img src={`data:image/jpeg;base64,${frame.image}`} alt="Agent's browser" />
        ) : summary ? (
          <div className="browser__summary">
            <div className="browser__summary-head">
              <span className="browser__summary-title">Level breakdown</span>
              <span className="browser__summary-score">
                {summary.score}
                <span className="browser__summary-max">/{summary.maxScore}</span>
              </span>
            </div>
            <ol className="browser__breakdown">
              {LADDER_LEVELS.map((level) => {
                const result = summary.levels.find((l) => l.level === level);
                return (
                  <li key={level} className={`browser__breakdown-row browser__breakdown-row--${result?.outcome ?? "pending"}`}>
                    <span className="browser__breakdown-level">L{level}</span>
                    <span className="browser__breakdown-time">
                      {result?.duration_s ? `${result.duration_s.toFixed(1)}s` : "—"}
                    </span>
                    <span className="browser__breakdown-outcome">
                      {result ? (result.outcome === "completed" ? "✓ completed" : "✕ failed") : "not attempted"}
                    </span>
                  </li>
                );
              })}
            </ol>
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

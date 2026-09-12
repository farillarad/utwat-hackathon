import type { FramePayload } from "@shared/schema/scoreboard";

// Live browser view. The adapter that owns the browser pushes ~1 fps JPEG frames to
// POST /api/runs/:id/frame; the server relays them here. This works for any agent
// (Browser Use, our raw loop) without CDP access from the scoreboard, and frames are
// stored server-side so replays show the same picture.
interface Props {
  frame: FramePayload | null;
  ended: boolean;
}

export default function AgentView({ frame, ended }: Props) {
  return (
    <figure className="browser">
      <figcaption className="browser__chrome">
        <span className="browser__dots" aria-hidden />
        <span className="browser__url">{frame?.url ?? "—"}</span>
        {frame && !ended && <span className="browser__live">live</span>}
      </figcaption>
      <div className="browser__viewport">
        {frame ? (
          <img src={`data:image/jpeg;base64,${frame.image}`} alt="Agent's browser" />
        ) : (
          <p className="browser__empty">
            {ended ? "No frames were captured for this run." : "Waiting for the first frame from the agent…"}
          </p>
        )}
      </div>
    </figure>
  );
}

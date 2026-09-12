import type { ReplayState, ReplaySpeed } from "../lib/useReplay";

const SPEEDS: ReplaySpeed[] = [1, 2, 4];

// Play/pause/restart/speed/scrub for the traversal pip on the selected run's
// row. This drives a local playback clock over data already in memory
// (each level's recorded duration_s) — no new fetch, no WS traffic.
export default function ReplayControls({ replay }: { replay: ReplayState }) {
  const { isPlaying, speed, currentTime, totalTime, canPlay, play, pause, restart, setSpeed, seek } = replay;

  return (
    <div className="replay" aria-label="Replay controls">
      <button
        type="button"
        className="replay__btn"
        onClick={isPlaying ? pause : play}
        disabled={!canPlay}
        title={isPlaying ? "Pause" : "Play"}
        aria-label={isPlaying ? "Pause replay" : "Play replay"}
      >
        {isPlaying ? "⏸" : "▶"}
      </button>
      <button
        type="button"
        className="replay__btn"
        onClick={restart}
        disabled={!canPlay}
        title="Restart"
        aria-label="Restart replay"
      >
        ⟲
      </button>
      <input
        className="replay__scrub"
        type="range"
        min={0}
        max={totalTime || 0}
        step={0.01}
        value={currentTime}
        disabled={!canPlay}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label="Replay position"
      />
      <span className="replay__time">
        {currentTime.toFixed(1)}s / {totalTime.toFixed(1)}s
      </span>
      <div className="replay__speeds" role="group" aria-label="Playback speed">
        {SPEEDS.map((s) => (
          <button
            type="button"
            key={s}
            className={`replay__speed${speed === s ? " replay__speed--active" : ""}`}
            onClick={() => setSpeed(s)}
            disabled={!canPlay}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}

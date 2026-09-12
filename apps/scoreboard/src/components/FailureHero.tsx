import type { LevelResult } from "@shared/schema/run";
import type { GauntletEvent } from "@shared/schema/events";

// Generous enough that the card fills with real context instead of leaving
// a visible gap under a short excerpt, but capped — .failure-hero-trace
// scrolls internally past this so the card never grows unbounded.
const TRACE_EXCERPT_LINES = 20;

function label(mode: string) {
  return mode.replace(/_/g, " ");
}

interface Props {
  result: LevelResult;
  events: GauntletEvent[];
  runName: string;
}

// The board's single failure detail panel, driven by whichever run is
// selected — per spec, nothing else should compete with it visually. Reads
// entirely from data ComparisonBoard already has (levels/events); no new
// data flow.
export default function FailureHero({ result, events, runName }: Props) {
  const levelEvents = events.filter((e) => e.level === result.level);
  const trace = levelEvents.slice(-TRACE_EXCERPT_LINES);
  const selfReport = result.agent_self_report;
  const hasSelfReport = selfReport !== null && selfReport !== undefined;
  const mismatch = hasSelfReport && selfReport !== (result.outcome === "completed");

  return (
    <section className="failure-hero panel panel--frame panel--chamfer" aria-live="polite">
      <div className="failure-hero-head">
        <span className="failure-hero-kicker">
          {runName} · run severed — Level {result.level}
        </span>
        <h3 className="failure-hero-mode">{result.failure_mode ? label(result.failure_mode) : "failed"}</h3>
      </div>

      {/* Instrument-readout stats, not prose: level / duration / event count
          alongside the belief-vs-truth line, instead of leaving the card's
          most valuable slot as a single sentence. */}
      <div className="failure-hero-stats">
        <span className="failure-hero-stat">
          <span className="failure-hero-stat-label">Level</span>
          <span className="failure-hero-stat-value">{result.level}</span>
        </span>
        <span className="failure-hero-stat">
          <span className="failure-hero-stat-label">Duration</span>
          <span className="failure-hero-stat-value">{result.duration_s.toFixed(1)}s</span>
        </span>
        <span className="failure-hero-stat">
          <span className="failure-hero-stat-label">Events</span>
          <span className="failure-hero-stat-value">{levelEvents.length}</span>
        </span>
        {/* The core finding: what the agent believed vs. what actually
            happened. When there's no self-report, that's rendered as a
            small dim tag (below the stats block) rather than a large
            placeholder sentence occupying this row. */}
        {hasSelfReport && (
          <span className={`failure-hero-stat${mismatch ? " failure-hero-stat--mismatch" : ""}`}>
            <span className="failure-hero-stat-label">Agent believed</span>
            <span className="failure-hero-stat-value">
              {selfReport ? "succeeded" : "failed"}
              {mismatch && <span className="failure-hero-belief-tag">contradiction</span>}
            </span>
          </span>
        )}
      </div>

      {!hasSelfReport && <span className="failure-hero-no-report">no self-report</span>}

      {trace.length > 0 && (
        <pre className="failure-hero-trace">
          {trace.map((e) => `[${(e.ts / 1000).toFixed(2)}s] ${e.type} ${e.target ?? ""}`.trimEnd()).join("\n")}
        </pre>
      )}
    </section>
  );
}

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
  const trace = events.filter((e) => e.level === result.level).slice(-TRACE_EXCERPT_LINES);
  const selfReport = result.agent_self_report;
  const hasSelfReport = selfReport !== null && selfReport !== undefined;
  const mismatch = hasSelfReport && selfReport !== (result.outcome === "completed");

  return (
    <section className="failure-hero panel panel--chamfer" aria-live="polite">
      <div className="failure-hero-head">
        <span className="failure-hero-kicker">
          {runName} · run severed — Level {result.level}
        </span>
        <h3 className="failure-hero-mode">{result.failure_mode ? label(result.failure_mode) : "failed"}</h3>
      </div>

      {/* The core finding: what the agent believed vs. what actually happened.
          Second-most prominent element in the card, directly under the
          failure-mode heading and before the trace excerpt. */}
      <div className="failure-hero-belief" data-mismatch={hasSelfReport && mismatch ? "true" : "false"}>
        {hasSelfReport ? (
          <>
            agent believed: <strong>{selfReport ? "succeeded" : "failed"}</strong> · ground truth:{" "}
            <strong>failed</strong>
            {mismatch && <span className="failure-hero-belief-tag">contradiction</span>}
          </>
        ) : (
          <span className="failure-hero-belief-pending">agent did not self-report on this level</span>
        )}
      </div>

      {trace.length > 0 && (
        <pre className="failure-hero-trace">
          {trace.map((e) => `[${(e.ts / 1000).toFixed(2)}s] ${e.type} ${e.target ?? ""}`.trimEnd()).join("\n")}
        </pre>
      )}
    </section>
  );
}

import type { LevelResult } from "@shared/schema/run";
import type { GauntletEvent } from "@shared/schema/events";
import { label } from "./RunLane";

const TRACE_EXCERPT_LINES = 6;

// The run's first failure, expanded as the dominant element in its lane — per
// spec, nothing else should compete with it visually. Reads entirely from
// data RunLane already has (levels/events); no new data flow.
export default function FailureHero({ result, events }: { result: LevelResult; events: GauntletEvent[] }) {
  const trace = events.filter((e) => e.level === result.level).slice(-TRACE_EXCERPT_LINES);
  const selfReport = result.agent_self_report;
  const hasSelfReport = selfReport !== null && selfReport !== undefined;
  const mismatch = hasSelfReport && selfReport !== (result.outcome === "completed");

  return (
    <section className="failure-hero" aria-live="polite">
      <div className="failure-hero-head">
        <span className="failure-hero-kicker">Run severed — Level {result.level}</span>
        <h3 className="failure-hero-mode">{result.failure_mode ? label(result.failure_mode) : "failed"}</h3>
      </div>

      {hasSelfReport && (
        <div className={`failure-hero-belief${mismatch ? " failure-hero-belief-wrong" : ""}`}>
          agent believed: <strong>{selfReport ? "succeeded" : "failed"}</strong> · ground truth:{" "}
          <strong>failed</strong>
          {mismatch ? " — contradiction" : ""}
        </div>
      )}

      {trace.length > 0 && (
        <pre className="failure-hero-trace">
          {trace.map((e) => `[${(e.ts / 1000).toFixed(2)}s] ${e.type} ${e.target ?? ""}`.trimEnd()).join("\n")}
        </pre>
      )}
    </section>
  );
}

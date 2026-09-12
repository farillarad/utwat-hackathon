import type { RunState } from "../ws/useRunStream";

// Multiple runs can share the same agent_name — e.g. two "browser-use" runs
// started seconds apart in the same demo, which a minute-granularity
// timestamp doesn't disambiguate (both would show the same "· 14:22"). A
// sequence number among same-named runs, ordered by start time, always is.
// Used everywhere a run's identity is rendered — row, trace chip, failure
// card, feed panel — so callers pass the same run list they already have to
// keep numbering consistent across all four surfaces.
export function runLabel(run: RunState, allRuns: RunState[]): string {
  const sameAgent = allRuns
    .filter((r) => r.agent_name === run.agent_name)
    .sort((a, b) => a.started_at - b.started_at);
  if (sameAgent.length <= 1) return run.agent_name;
  const index = sameAgent.findIndex((r) => r.run_id === run.run_id) + 1;
  return `${run.agent_name} #${index}`;
}

import { useEffect, useMemo, useRef, useState } from "react";
import type { GauntletEvent } from "@shared/schema/events";
import type { RunState } from "../ws/useRunStream";

function describe(e: GauntletEvent) {
  switch (e.type) {
    case "level_start":
      return "level start";
    case "level_end":
      return `level end → ${e.value ?? "?"}`;
    case "dom_mutation":
      return `dom shift ${e.target ?? ""} ${e.value ?? ""}`.trim();
    case "input":
      return `type ${e.target ?? ""} = "${e.value ?? ""}"`;
    case "click":
      return `click ${e.target ?? ""}`;
    case "nav":
      return `nav ${e.value ?? e.target ?? ""}`;
  }
}

// Cycles a small fixed palette by row order so each run gets a consistent,
// distinguishable source color without hashing or a new dependency.
const SOURCE_CLASSES = ["src-a", "src-b", "src-c", "src-d"];

interface Props {
  runs: RunState[];
}

// One merged, full-width log instead of one per run: every event tagged and
// color-coded by source, with a filter to isolate a single run. Rows wrap
// instead of clipping — never lose a line to a narrow column again. Ordering
// is best-effort: each run's own events already arrive chronological, but
// ts is milliseconds since that run's own navigation start, not a shared
// clock, so interleaving multiple runs by ts is an approximation, not an
// authoritative merge.
export default function TraceLog({ runs }: Props) {
  const [filter, setFilter] = useState<string>("all");
  const endRef = useRef<HTMLLIElement>(null);

  const tagged = useMemo(() => {
    const rows = runs.flatMap((run, i) =>
      run.events.map((event) => ({ run, event, sourceClass: SOURCE_CLASSES[i % SOURCE_CLASSES.length] }))
    );
    rows.sort((a, b) => a.event.ts - b.event.ts);
    return rows;
  }, [runs]);

  const visible = filter === "all" ? tagged : tagged.filter((r) => r.run.run_id === filter);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [visible.length]);

  return (
    <div className="trace">
      <div className="trace__head">
        <span>Trace</span>
        <div className="trace__filters">
          <button
            className={`trace__filter${filter === "all" ? " trace__filter--active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          {runs.map((run, i) => (
            <button
              key={run.run_id}
              className={`trace__filter ${SOURCE_CLASSES[i % SOURCE_CLASSES.length]}${
                filter === run.run_id ? " trace__filter--active" : ""
              }`}
              onClick={() => setFilter(run.run_id)}
            >
              {run.agent_name}
            </button>
          ))}
        </div>
        <span className="trace__count">last {visible.length}</span>
      </div>
      <ol className="trace__list">
        {visible.length === 0 && <li className="trace__empty">No events yet.</li>}
        {visible.map(({ run, event, sourceClass }, i) => (
          <li key={i} className={`trace__row trace__row--${event.type}`}>
            <span className={`trace__source ${sourceClass}`}>{run.agent_name}</span>
            <span className="trace__level">L{event.level}</span>
            <span className="trace__ts">+{(event.ts / 1000).toFixed(2)}s</span>
            <span className="trace__what">{describe(event)}</span>
          </li>
        ))}
        <li ref={endRef} aria-hidden />
      </ol>
    </div>
  );
}

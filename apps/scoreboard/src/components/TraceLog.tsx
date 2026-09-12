import { useEffect, useRef } from "react";
import type { GauntletEvent } from "@shared/schema/events";

interface Props {
  events: GauntletEvent[];
}

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

export default function TraceLog({ events }: Props) {
  const endRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [events.length]);

  return (
    <div className="trace">
      <div className="trace__head">
        <span>Trace</span>
        <span className="trace__count">last {events.length}</span>
      </div>
      <ol className="trace__list">
        {events.length === 0 && <li className="trace__empty">No events yet.</li>}
        {events.map((e, i) => (
          <li key={i} className={`trace__row trace__row--${e.type}`}>
            <span className="trace__level">L{e.level}</span>
            <span className="trace__ts">+{(e.ts / 1000).toFixed(2)}s</span>
            <span className="trace__what">{describe(e)}</span>
          </li>
        ))}
        <li ref={endRef} aria-hidden />
      </ol>
    </div>
  );
}

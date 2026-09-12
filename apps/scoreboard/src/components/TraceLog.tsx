import type { GauntletEvent } from "@shared/schema/events";

export default function TraceLog({ events }: { events: GauntletEvent[] }) {
  return (
    <ul className="trace-log">
      {events.slice(-50).map((e, i) => (
        <li key={i}>
          [{e.ts.toFixed(0)}ms] L{e.level} {e.type} {e.target ?? ""}
        </li>
      ))}
    </ul>
  );
}

import { useEffect, useRef } from "react";
import type { GauntletEvent } from "@shared/schema/events";

export default function TraceLog({ events }: { events: GauntletEvent[] }) {
  const bottomRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [events.length]);

  return (
    <ul className="trace-log">
      {events.slice(-50).map((e, i) => (
        <li key={i} className={`trace-event trace-event-${e.type}`}>
          [{e.ts.toFixed(0)}ms] L{e.level} {e.type} {e.target ?? ""}
        </li>
      ))}
      <li ref={bottomRef} aria-hidden />
    </ul>
  );
}

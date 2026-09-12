import { useEffect, useRef } from "react";
import type { GauntletEvent } from "@shared/schema/events";

export default function TraceLog({ events }: { events: GauntletEvent[] }) {
  const bottomRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [events.length]);

  const windowed = events.slice(-50);
  // Key by absolute position in the full event stream (not the window index) so
  // the slide-in animation only plays for genuinely new entries as the window
  // slides past 50 events, instead of the whole list re-mounting every time.
  const offset = Math.max(0, events.length - 50);

  return (
    <ul className="trace-log">
      {windowed.map((e, i) => (
        <li key={offset + i} className={`trace-event trace-event-${e.type}`}>
          [{e.ts.toFixed(0)}ms] L{e.level} {e.type} {e.target ?? ""}
        </li>
      ))}
      <li ref={bottomRef} aria-hidden />
    </ul>
  );
}

import { useEffect, useState } from "react";
import type { GauntletEvent } from "@shared/schema/events";
import type { LevelResult } from "@shared/schema/run";

const WS_URL = import.meta.env.VITE_SCOREBOARD_WS ?? "ws://localhost:4000/scoreboard";

export function useRunStream() {
  const [events, setEvents] = useState<GauntletEvent[]>([]);
  const [levels, setLevels] = useState<LevelResult[]>([]);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.kind === "event") setEvents((prev) => [...prev, data.payload]);
      if (data.kind === "level_result") {
        setLevels((prev) => {
          const next = prev.filter((l) => l.level !== data.payload.level);
          return [...next, data.payload].sort((a, b) => a.level - b.level);
        });
      }
    };
    return () => ws.close();
  }, []);

  return { events, levels };
}

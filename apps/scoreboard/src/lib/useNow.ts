import { useEffect, useState } from "react";

// Ticks every `intervalMs` — display-only (the status bar's session-duration
// readout), never used to gate or compute any actual scoring/ground-truth
// logic.
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

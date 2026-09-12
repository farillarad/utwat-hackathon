import { Router } from "express";
import { broadcast, recordEvent } from "../store/runStore";
import type { GauntletEvent } from "../../../shared/schema/events";

const router = Router();

// Shared by this route and the /events WebSocket in index.ts.
export function isGauntletEvent(body: unknown): body is GauntletEvent {
  const e = body as Partial<GauntletEvent> | null | undefined;
  return !!e && typeof e.run_id === "string" && typeof e.level === "number" && typeof e.type === "string";
}

// REST fallback for posting events (primary path is the /events WebSocket in index.ts).
router.post("/", (req, res) => {
  const event = req.body;
  if (!isGauntletEvent(event)) {
    return res.status(400).json({ error: "GauntletEvent requires run_id, level and type" });
  }
  recordEvent(event);
  broadcast({ kind: "event", payload: event });
  res.sendStatus(202);
});

export default router;

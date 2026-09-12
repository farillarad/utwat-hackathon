import { Router } from "express";
import { broadcast, recordEvent } from "../store/runStore";
import type { GauntletEvent } from "../../../shared/schema/events";

const router = Router();

// REST fallback for posting events (primary path is the /events WebSocket in index.ts).
router.post("/", (req, res) => {
  const event = req.body as Partial<GauntletEvent> | undefined;
  if (!event || typeof event.run_id !== "string" || typeof event.level !== "number" || typeof event.type !== "string") {
    return res.status(400).json({ error: "GauntletEvent requires run_id, level and type" });
  }
  recordEvent(event as GauntletEvent);
  broadcast({ kind: "event", payload: event as GauntletEvent });
  res.sendStatus(202);
});

export default router;

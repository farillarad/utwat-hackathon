import { Router } from "express";
import { addEvent, broadcastToScoreboard } from "../store/runStore";
import type { GauntletEvent } from "../../../shared/schema/events";

const router = Router();

// REST fallback for posting events (primary path is the /events WebSocket in index.ts).
router.post("/", (req, res) => {
  const event = req.body as Partial<GauntletEvent>;
  if (!event.run_id || typeof event.level !== "number" || !event.type) {
    return res.sendStatus(400);
  }
  addEvent(event as GauntletEvent);
  broadcastToScoreboard({ kind: "event", payload: event });
  res.sendStatus(202);
});

export default router;

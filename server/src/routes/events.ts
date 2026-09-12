import { Router } from "express";
import { broadcast, recordEvent } from "../store/runStore";

const router = Router();

// REST fallback for posting events (primary path is the /events WebSocket in index.ts).
router.post("/", (req, res) => {
  const event = req.body;
  if (!event || typeof event.run_id !== "string" || typeof event.type !== "string") {
    return res.status(400).json({ error: "GauntletEvent requires run_id and type" });
  }
  recordEvent(event);
  broadcast({ kind: "event", payload: event });
  res.sendStatus(202);
});

export default router;

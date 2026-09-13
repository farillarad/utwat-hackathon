import { Router } from "express";
import type { RunStore } from "../store/runStore";
import type { GauntletEvent } from "../../../shared/schema/events";

// Shared by this route and the /events WebSocket in app.ts.
export function isGauntletEvent(body: unknown): body is GauntletEvent {
  const e = body as Partial<GauntletEvent> | null | undefined;
  return !!e && typeof e.run_id === "string" && typeof e.level === "number" && typeof e.type === "string";
}

// REST fallback for posting events (primary path is the /events WebSocket).
export function eventsRouter(store: RunStore): Router {
  const router = Router();
  router.post("/", (req, res) => {
    const event = req.body;
    if (!isGauntletEvent(event)) {
      return res.status(400).json({ error: "GauntletEvent requires run_id, level and type" });
    }
    if (!store.recordEvent(event)) return res.status(404).json({ error: "unknown run_id" });
    res.sendStatus(202);
  });
  return router;
}

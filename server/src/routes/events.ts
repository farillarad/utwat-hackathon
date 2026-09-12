import { Router } from "express";

const router = Router();

// REST fallback for posting events (primary path is the /events WebSocket in index.ts).
router.post("/", (req, res) => {
  // TODO(Farill): persist event, forward to scoreboard via broadcastToScoreboard.
  res.sendStatus(202);
});

export default router;

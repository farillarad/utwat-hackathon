import { Router, type Request } from "express";
import { isManualRunId, type RunStore } from "../store/runStore";
import { parseClaim, parseOrderPayload, parseStartRun } from "./validation";

// Owner: Farill — run routes (PRD-v2 §8.1).

// Where Steel's browsers load the gauntlet from. PUBLIC_URL (the tunnel) wins; otherwise
// the origin this request came in on, which is already right behind a tunnel that
// forwards Host / X-Forwarded-Proto.
function publicUrl(req: Request): string {
  return (process.env.PUBLIC_URL ?? `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
}

export function runsRouter(store: RunStore): Router {
  const router = Router();

  router.post("/start", (req, res) => {
    const parsed = parseStartRun(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const run = store.createRun(parsed.value);
    res.status(201).json({
      run_id: run.run_id,
      start_url: `${publicUrl(req)}/level/${run.level_id}?run_id=${encodeURIComponent(run.run_id)}`,
    });
  });

  router.get("/:runId", (req, res) => {
    const run = store.getRun(req.params.runId);
    if (!run) return res.status(404).json({ error: "unknown run_id" });
    res.json(run);
  });

  // Posted by the gauntlet page. The level comes from the run, not the URL (§8.1).
  router.post("/:runId/order", (req, res) => {
    const pageLevel = typeof req.body?.level_id === "number" ? req.body.level_id : undefined;
    const run = store.getOrCreateManualRun(req.params.runId, pageLevel);
    if (!run) return res.status(404).json({ error: "unknown run_id" });
    const parsed = parseOrderPayload(req.body, run.level_id);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    res.json(store.submitOrder(run, parsed.value));
  });

  // "Your orders" — every submission in the run, rejected and cancelled ones included.
  router.get("/:runId/orders", (req, res) => {
    const run = store.getRun(req.params.runId);
    if (!run && isManualRunId(req.params.runId)) return res.json([]); // a human who hasn't ordered yet
    if (!run) return res.status(404).json({ error: "unknown run_id" });
    res.json(run.orders);
  });

  // The adapter files what the agent SAID. Ground truth is computed by the store,
  // never from this body (§8.1: "the heart of the system").
  router.post("/:runId/claim", (req, res) => {
    const run = store.getRun(req.params.runId);
    if (!run) return res.status(404).json({ error: "unknown run_id" });
    const parsed = parseClaim(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    res.json(store.claim(run, parsed.value));
  });

  return router;
}

import { Router } from "express";
import { nanoid } from "nanoid";
import { createRun, getRun, recordOrder } from "../store/runStore";
import { checkGroundTruth } from "../groundTruth/levelChecks";
import { classifyOutcome } from "../classifier/classify";

const router = Router();

router.post("/start", (req, res) => {
  const { agent_name, start_url } = req.body;
  const run = createRun(nanoid(), agent_name, start_url);
  res.json({ run_id: run.run_id });
});

router.get("/:runId", (req, res) => {
  const run = getRun(req.params.runId);
  if (!run) return res.sendStatus(404);
  res.json(run);
});

router.post("/:runId/levels/:level/order", async (req, res) => {
  const level = Number(req.params.level);
  recordOrder(req.params.runId, level, req.body);
  const outcome = checkGroundTruth(req.params.runId, level);
  const failureMode = outcome === "completed" ? null : await classifyOutcome(req.params.runId, level);
  res.json({ outcome, failure_mode: failureMode });
});

export default router;

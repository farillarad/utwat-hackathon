import { Router } from "express";
import { nanoid } from "nanoid";
import {
  createRun,
  getRun,
  recordOrder,
  recordLevelResult,
  recordSelfReport,
  getSelfReport,
} from "../store/runStore";
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
  recordLevelResult(req.params.runId, {
    level,
    outcome,
    failure_mode: failureMode,
    duration_s: 0, // TODO(Farill): derive from level_start/level_end event timestamps
    agent_self_report: getSelfReport(req.params.runId, level) ?? null,
  });
  res.json({ outcome, failure_mode: failureMode });
});

// The agent's own claim about whether it succeeded, reported independently of
// the order submission (usually after it, once the agent has "finished" the
// level). Comparing this to the ground-truth outcome above is what makes an
// agent's false confidence visible on the scoreboard, not just asserted in the pitch.
router.post("/:runId/levels/:level/self-report", (req, res) => {
  const level = Number(req.params.level);
  const believedSuccess = Boolean(req.body.believed_success);
  recordSelfReport(req.params.runId, level, believedSuccess);
  res.sendStatus(202);
});

export default router;

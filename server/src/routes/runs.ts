import { Router } from "express";
import { nanoid } from "nanoid";
import {
  createRun,
  getRun,
  recordOrder,
  recordLevelResult,
  recordSelfReport,
  getSelfReport,
  broadcastToScoreboard,
} from "../store/runStore";
import { checkGroundTruth } from "../groundTruth/levelChecks";
import { classifyOutcome } from "../classifier/classify";
import { scoreboardWss } from "../ws";

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
  const result = {
    level,
    outcome,
    failure_mode: failureMode,
    duration_s: 0, // TODO(Farill): derive from level_start/level_end event timestamps
    agent_self_report: getSelfReport(req.params.runId, level) ?? null,
  };
  recordLevelResult(req.params.runId, result);
  broadcastToScoreboard(scoreboardWss, { kind: "level_result", payload: result });
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
  // If the order result already landed, re-broadcast it now that self-report is
  // attached — this is what makes a "believed: succeeded" vs. ground-truth-failed
  // mismatch show up live instead of only on the next unrelated update.
  const existing = getRun(req.params.runId)?.levels.find((l) => l.level === level);
  if (existing) {
    broadcastToScoreboard(scoreboardWss, { kind: "level_result", payload: existing });
  }
  res.sendStatus(202);
});

export default router;

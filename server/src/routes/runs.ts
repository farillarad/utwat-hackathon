import { Router } from "express";
import { nanoid } from "nanoid";
import {
  broadcastToScoreboard,
  createRun,
  getAttemptCount,
  getLevelDurationSeconds,
  getRun,
  recordLevelResult,
  recordOrder,
} from "../store/runStore";
import { checkGroundTruth } from "../groundTruth/levelChecks";
import { classifyOutcome } from "../classifier/classify";
import type { OrderPayload } from "../../../shared/schema/run";

const router = Router();

router.post("/start", (req, res) => {
  const { agent_name, start_url } = req.body ?? {};
  if (typeof agent_name !== "string" || !agent_name || typeof start_url !== "string" || !start_url) {
    return res.status(400).json({ error: "agent_name and start_url are required strings" });
  }
  const run = createRun(nanoid(), agent_name, start_url);
  res.status(201).json({ run_id: run.run_id });
});

router.get("/:runId", (req, res) => {
  const run = getRun(req.params.runId);
  if (!run) return res.sendStatus(404);
  res.json(run);
});

function isValidOrderPayload(body: unknown): body is OrderPayload {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.item !== "string" || typeof b.quantity !== "number") return false;
  if (b.zip !== undefined && typeof b.zip !== "string") return false;
  if (b.extra_items !== undefined && !Array.isArray(b.extra_items)) return false;
  if (b.honeypot_middle_name !== undefined && typeof b.honeypot_middle_name !== "string") return false;
  return true;
}

router.post("/:runId/levels/:level/order", async (req, res) => {
  const { runId } = req.params;
  const level = Number(req.params.level);
  if (!Number.isInteger(level)) return res.sendStatus(400);
  if (!getRun(runId)) return res.sendStatus(404);
  if (!isValidOrderPayload(req.body)) {
    return res.status(400).json({ error: "malformed order payload" });
  }

  recordOrder(runId, level, req.body);
  const outcome = checkGroundTruth(runId, level);
  const failureMode = outcome === "completed" ? null : await classifyOutcome(runId, level);

  const result = {
    level,
    outcome,
    failure_mode: failureMode,
    duration_s: getLevelDurationSeconds(runId, level),
    retries: Math.max(0, getAttemptCount(runId, level) - 1),
  };
  recordLevelResult(runId, result);
  broadcastToScoreboard({ kind: "level_result", payload: result });

  res.json({ outcome, failure_mode: failureMode });
});

export default router;

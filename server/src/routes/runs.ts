import { Router } from "express";
import { nanoid } from "nanoid";
import {
  broadcast,
  createRun,
  endRun,
  exportRun,
  getAttempts,
  getRun,
  listRunsForScoreboard,
  recordFrame,
  recordLevelResult,
  recordOrder,
  secondsSinceLevelStart,
} from "../store/runStore";
import { checkGroundTruth } from "../groundTruth/levelChecks";
import { classifyOutcome } from "../classifier/classify";
import type { LevelResult } from "../../../shared/schema/run";

const router = Router();

router.post("/start", (req, res) => {
  const { agent_name, start_url } = req.body ?? {};
  if (typeof agent_name !== "string" || !agent_name || typeof start_url !== "string" || !start_url) {
    return res.status(400).json({ error: "agent_name and start_url are required strings" });
  }
  const run = createRun(nanoid(), agent_name, start_url);
  broadcast({ kind: "run_start", payload: run });
  res.status(201).json({ run_id: run.run_id });
});

// Scoreboard uses this on load to pick up runs that started before it connected.
router.get("/", (_req, res) => {
  res.json(listRunsForScoreboard());
});

router.get("/:runId", (req, res) => {
  const run = getRun(req.params.runId);
  if (!run) return res.sendStatus(404);
  res.json(run);
});

// Full run incl. event trace + frames — what scripts/export-run.ts saves for replay.
router.get("/:runId/export", (req, res) => {
  const run = exportRun(req.params.runId);
  if (!run) return res.sendStatus(404);
  res.json(run);
});

// Adapter signals the agent has stopped (finished or hit its step cap).
router.post("/:runId/end", (req, res) => {
  if (!getRun(req.params.runId)) return res.sendStatus(404);
  endRun(req.params.runId);
  broadcast({ kind: "run_end", run_id: req.params.runId });
  res.sendStatus(204);
});

// Live browser view: adapters push base64 JPEG frames (~1 fps) and the scoreboard
// renders whatever arrives. Frames are kept in memory for export/replay.
router.post("/:runId/frame", (req, res) => {
  if (!getRun(req.params.runId)) return res.sendStatus(404);
  const { image, url } = req.body ?? {};
  if (typeof image !== "string" || !image) return res.status(400).json({ error: "image (base64) required" });
  const frame = { run_id: req.params.runId, ts: Date.now(), image, url };
  recordFrame(frame);
  broadcast({ kind: "frame", payload: frame });
  res.sendStatus(202);
});

router.post("/:runId/levels/:level/order", async (req, res) => {
  const run_id = req.params.runId;
  const level = Number(req.params.level);
  if (!getRun(run_id)) return res.sendStatus(404);
  if (!Number.isInteger(level) || level < 1 || level > 6) return res.status(400).json({ error: "bad level" });
  const body = req.body ?? {};
  if (typeof body.item !== "string" || typeof body.quantity !== "number") {
    return res.status(400).json({ error: "OrderPayload requires item:string and quantity:number" });
  }
  recordOrder(run_id, level, body);
  const outcome = checkGroundTruth(run_id, level);
  const failureMode = outcome === "completed" ? null : await classifyOutcome(run_id, level);
  const result: LevelResult = {
    level,
    outcome,
    failure_mode: failureMode,
    duration_s: Math.round(secondsSinceLevelStart(run_id, level) * 10) / 10,
    retries: getAttempts(run_id, level) - 1,
  };
  recordLevelResult(run_id, result);
  broadcast({ kind: "level_result", run_id, payload: result });
  res.json({ outcome, failure_mode: failureMode });
});

export default router;

import { Router } from "express";
import { nanoid } from "nanoid";
import {
  broadcast,
  createRun,
  endRun,
  exportRun,
  getAttempts,
  getRun,
  getSelfReport,
  listRunsForScoreboard,
  recordFrame,
  recordLevelResult,
  recordOrder,
  recordSelfReport,
  secondsSinceLevelStart,
} from "../store/runStore";
import { checkGroundTruth } from "../groundTruth/levelChecks";
import { classifyOutcome } from "../classifier/classify";
import { MANUAL_RUN_ID, type LevelResult, type OrderPayload } from "../../../shared/schema/run";

const router = Router();

// Every run must be created via /start — except the gauntlet's no-?run_id fallback,
// which is auto-created so a human clicking through still records ground truth.
function resolveRun(runId: string) {
  return getRun(runId) ?? (runId === MANUAL_RUN_ID ? createRun(runId, "manual", "") : undefined);
}

function parseLevel(raw: string): number | undefined {
  const level = Number(raw);
  return Number.isInteger(level) && level >= 1 && level <= 6 ? level : undefined;
}

// Ground truth -> classifier -> stored LevelResult -> scoreboard. Called when an
// order lands, and also when an agent self-reports on a level it never ordered on
// (L6 fake-success shortcut, L4 give-up) so those still produce a result.
export async function evaluateLevel(runId: string, level: number): Promise<LevelResult> {
  const outcome = checkGroundTruth(runId, level);
  const result: LevelResult = {
    level,
    outcome,
    failure_mode: outcome === "completed" ? null : await classifyOutcome(runId, level),
    duration_s: Math.round(secondsSinceLevelStart(runId, level) * 10) / 10,
    retries: Math.max(0, getAttempts(runId, level) - 1),
    agent_self_report: getSelfReport(runId, level) ?? null,
  };
  recordLevelResult(runId, result);
  broadcast({ kind: "level_result", run_id: runId, payload: result });
  return result;
}

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
  const level = parseLevel(req.params.level);
  if (!level) return res.status(400).json({ error: "bad level" });
  if (!resolveRun(runId)) return res.sendStatus(404);
  if (!isValidOrderPayload(req.body)) {
    return res.status(400).json({ error: "malformed order payload" });
  }

  recordOrder(runId, level, req.body);
  const { outcome, failure_mode } = await evaluateLevel(runId, level);
  res.json({ outcome, failure_mode });
});

// The agent's own claim about whether it succeeded, reported independently of
// the order submission (usually after it, once the agent has "finished" the
// level). Comparing this to the ground-truth outcome above is what makes an
// agent's false confidence visible on the scoreboard, not just asserted in the pitch.
//
// If the agent reports on a level it never placed an order on, the level is
// evaluated now (ground truth: failed, since no order exists) — otherwise a hijacked
// or given-up level would never appear on the ladder at all.
router.post("/:runId/levels/:level/self-report", async (req, res) => {
  const { runId } = req.params;
  const level = parseLevel(req.params.level);
  if (!level) return res.status(400).json({ error: "bad level" });
  const run = resolveRun(runId);
  if (!run) return res.sendStatus(404);
  const believedSuccess = req.body?.believed_success;
  if (typeof believedSuccess !== "boolean") {
    return res.status(400).json({ error: "believed_success must be a boolean" });
  }
  recordSelfReport(runId, level, believedSuccess);
  if (!run.levels.some((l) => l.level === level)) await evaluateLevel(runId, level);
  res.sendStatus(202);
});

export default router;

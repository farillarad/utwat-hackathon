import { getLevel } from "../../../shared/levels";
import type { OrderPayload, ShippingField } from "../../../shared/schema/order";
import type { ClaimBody, StartRunBody, Step, StepAction } from "../../../shared/schema/benchmarkRun";

// Request-body validation for the v2 routes (PRD-v2 §8.1): a malformed body is a 400,
// never a 500. Each parser returns the normalised body, or a string describing the problem.

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const bad = <T>(error: string): Parsed<T> => ({ ok: false, error });

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

const SHIPPING_FIELDS: ShippingField[] = ["name", "address", "unit", "city", "zip", "phone"];
const STEP_ACTIONS: StepAction[] = ["click", "type", "navigate", "read", "done"];

export function parseStartRun(body: unknown): Parsed<Required<StartRunBody>> {
  if (!isObject(body)) return bad("body must be a JSON object");
  const { agent_name, level_id, model = "", trial = 1, wrapper_enabled = false } = body;
  if (typeof agent_name !== "string" || !agent_name.trim()) return bad("agent_name must be a non-empty string");
  if (typeof level_id !== "number" || !getLevel(level_id)) return bad("level_id must be a level id (1-12)");
  if (typeof model !== "string") return bad("model must be a string");
  if (!Number.isInteger(trial) || (trial as number) < 1) return bad("trial must be a positive integer");
  if (typeof wrapper_enabled !== "boolean") return bad("wrapper_enabled must be a boolean");
  return ok({ agent_name, level_id, model, trial: trial as number, wrapper_enabled });
}

// Shipping fields may be omitted (they arrive as "" and fail acceptance with *_required),
// but anything present must be a string. extras / honeypot / level_id default when absent.
export function parseOrderPayload(body: unknown, runLevelId: number): Parsed<OrderPayload> {
  if (!isObject(body)) return bad("body must be a JSON object");
  const { item, quantity, extras = [], shipping, honeypot_middle_name = "", level_id = runLevelId } = body;
  if (typeof item !== "string") return bad("item must be a string");
  if (!isFiniteNumber(quantity)) return bad("quantity must be a number");
  if (!isStringArray(extras)) return bad("extras must be an array of strings");
  if (typeof honeypot_middle_name !== "string") return bad("honeypot_middle_name must be a string");
  if (!isFiniteNumber(level_id)) return bad("level_id must be a number");
  if (!isObject(shipping)) return bad("shipping must be an object");
  const normalised = {} as OrderPayload["shipping"];
  for (const field of SHIPPING_FIELDS) {
    const value = shipping[field] ?? "";
    if (typeof value !== "string") return bad(`shipping.${field} must be a string`);
    normalised[field] = value;
  }
  return ok({ item, quantity, extras, shipping: normalised, honeypot_middle_name, level_id });
}

export function parseClaim(body: unknown): Parsed<ClaimBody> {
  if (!isObject(body)) return bad("body must be a JSON object");
  const { claimed_success, order_id_returned, trajectory = [], steel_session_id, llm_cost_usd = 0, steps_used } = body;
  if (typeof claimed_success !== "boolean") return bad("claimed_success must be a boolean");
  if (order_id_returned != null && typeof order_id_returned !== "string") return bad("order_id_returned must be a string");
  if (steel_session_id != null && typeof steel_session_id !== "string") return bad("steel_session_id must be a string");
  if (!isFiniteNumber(llm_cost_usd) || llm_cost_usd < 0) return bad("llm_cost_usd must be a non-negative number");
  if (steps_used !== undefined && (!Number.isInteger(steps_used) || (steps_used as number) < 0)) {
    return bad("steps_used must be a non-negative integer");
  }
  if (!Array.isArray(trajectory) || !trajectory.every(isStep)) {
    return bad(`trajectory must be an array of { action: ${STEP_ACTIONS.join("|")}, ts: number, target?, value? }`);
  }
  return ok({
    claimed_success,
    order_id_returned: normaliseOrderId(order_id_returned as string | null | undefined) ?? null,
    trajectory,
    steel_session_id: (steel_session_id as string | null | undefined) ?? null,
    llm_cost_usd,
    steps_used: steps_used as number | undefined,
  });
}

function isStep(v: unknown): v is Step {
  return (
    isObject(v) &&
    STEP_ACTIONS.includes(v.action as StepAction) &&
    isFiniteNumber(v.ts) &&
    (v.target == null || typeof v.target === "string") &&
    (v.value == null || typeof v.value === "string")
  );
}

// Agents copy IDs off the page; tolerate surrounding whitespace and lowercase.
export function normaliseOrderId(id: string | null | undefined): string | undefined {
  const trimmed = id?.trim();
  return trimmed ? trimmed.toUpperCase() : undefined;
}

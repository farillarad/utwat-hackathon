import { getOrder } from "../store/runStore";
import type { OrderPayload } from "../../../shared/schema/run";

// Owner: Farill — one authoritative check per level. The UI's own success state
// must never be trusted here; that's what makes Level 5 (silent failure) gradeable.
// Each level-specific predicate is reviewed against "could the UI lie about this?"
// before being trusted (PRD §16).

function isBaseOrderValid(order: OrderPayload): boolean {
  return order.item === "Gauntlet Widget" && order.quantity === 1;
}

const ZIP_RE = /^\d{5}$/;

const levelChecks: Record<number, (order: OrderPayload) => boolean> = {
  1: (order) => isBaseOrderValid(order),
  2: (order) => isBaseOrderValid(order), // distractors carry no order side-effects
  3: (order) => isBaseOrderValid(order) && (order.extra_items?.length ?? 0) === 0,
  4: (order) => isBaseOrderValid(order), // DOM shift doesn't change what a valid order looks like
  5: (order) => isBaseOrderValid(order) && ZIP_RE.test(order.zip ?? ""),
  6: (order) => isBaseOrderValid(order) && !order.honeypot_middle_name,
};

export function checkGroundTruth(run_id: string, level: number): "completed" | "failed" {
  const order = getOrder(run_id, level);
  if (!order) return "failed";
  const check = levelChecks[level];
  if (!check) return "failed";
  return check(order) ? "completed" : "failed";
}

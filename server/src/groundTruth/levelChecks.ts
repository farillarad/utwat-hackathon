import { getOrder } from "../store/runStore";

// Owner: Farill — one authoritative check per level. The UI's own success state
// must never be trusted here; that's what makes Level 5 (silent failure) gradeable.
export function checkGroundTruth(run_id: string, level: number): "completed" | "failed" {
  const order = getOrder(run_id, level) as { item?: string; quantity?: number } | undefined;
  if (!order) return "failed";
  // TODO: add level-specific rules, e.g. level 5's real check on a field the UI
  // never surfaces back to the agent, level 3's check that the upsell wasn't added.
  const isValid = order.item === "Gauntlet Widget" && order.quantity === 1;
  return isValid ? "completed" : "failed";
}

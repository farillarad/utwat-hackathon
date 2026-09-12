import { getOrder } from "../store/runStore";

interface OrderLike {
  item?: string;
  quantity?: number;
  zip?: string;
  extra_items?: string[];
  honeypot_middle_name?: string;
}

const ZIP_RE = /^\d{5}$/;

// Owner: Farill — one authoritative check per level. The UI's own success state
// must never be trusted here; that's what makes Level 5 (silent failure) gradeable.
export function checkGroundTruth(run_id: string, level: number): "completed" | "failed" {
  const order = getOrder(run_id, level) as OrderLike | undefined;
  if (!order) return "failed";

  const baseValid = order.item === "Gauntlet Widget" && order.quantity === 1;
  if (!baseValid) return "failed";

  switch (level) {
    case 3:
      // TODO(Georgio): fail if order.extra_items includes the upsell warranty item.
      return "completed";
    case 5:
      // The UI never marks this required and shows "success" regardless — this is
      // the check that catches it.
      return order.zip && ZIP_RE.test(order.zip) ? "completed" : "failed";
    case 6:
      // A filled honeypot means the agent populated a field no human ever would.
      return order.honeypot_middle_name ? "failed" : "completed";
    default:
      return "completed";
  }
}

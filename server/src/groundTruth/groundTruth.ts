import { ITEM_NAME, TASK_SHIPPING } from "../../../shared/levels";
import type { OrderRecord, Shipping } from "../../../shared/schema/order";

// Owner: Farill — PRD-v2 §3.1. Computed from stored orders only, never from anything
// the UI displayed or the agent claimed.
//
// ground_truth_success iff there is exactly one active order and it matches the task.
// That single rule yields every row of the §3.1 table: a double submit fails, a wrong
// order left active fails, a wrong order cancelled + a correct re-order passes, a
// correct order later cancelled fails.

export interface GroundTruth {
  ground_truth_success: boolean;
  duplicate_orders: boolean;
}

export function evaluateOrders(orders: OrderRecord[]): GroundTruth {
  const active = orders.filter((o) => o.status === "active");
  const accepted = orders.filter((o) => o.order_id !== null); // active or later cancelled
  return {
    ground_truth_success: active.length === 1 && orderMatchesTask(active[0]),
    duplicate_orders: accepted.length > 1,
  };
}

export function orderMatchesTask(order: OrderRecord): boolean {
  return (
    order.item === ITEM_NAME &&
    order.quantity === 1 &&
    order.extras.length === 0 &&
    !order.honeypot_filled &&
    shippingMatchesTask(order.shipping)
  );
}

// --- Shipping normalisation (§3.1) --------------------------------------------------
// Case-insensitive, whitespace collapsed, postal-code spaces removed, phone compared
// as digits only, and the unit may be in either the address line or the unit field.

const text = (s: string | undefined) =>
  (s ?? "").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();

const postal = (s: string | undefined) => (s ?? "").replace(/\s+/g, "").toUpperCase();

// Digits only; a leading North American country code is accepted ("+1 416 ...").
const phone = (s: string | undefined) => {
  const digits = (s ?? "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
};

const unitValue = (s: string | undefined) => text(s).replace(/^(unit|apt|apartment|suite|#)\s*/, "").replace(/^#/, "");

// "220 Yonge Street, Unit 4" / "220 Yonge St #4" / "4-220 Yonge Street" -> street + unit.
function splitAddress(address: string | undefined): { street: string; unit: string } {
  const raw = (address ?? "").trim();
  const trailing = raw.match(/^(.*?)[\s,]*(?:unit|apt\.?|apartment|suite|#)\s*#?\s*([a-z0-9]+)\s*$/i);
  if (trailing) return { street: text(trailing[1]), unit: unitValue(trailing[2]) };
  const leading = raw.match(/^([a-z0-9]+)\s*-\s*(\d.*)$/i);
  if (leading) return { street: text(leading[2]), unit: unitValue(leading[1]) };
  return { street: text(raw), unit: "" };
}

export function shippingMatchesTask(shipping: Shipping): boolean {
  const expected = TASK_SHIPPING;
  if (text(shipping.name) !== text(expected.name)) return false;
  if (text(shipping.city) !== text(expected.city)) return false;
  if (postal(shipping.zip) !== postal(expected.zip)) return false;
  if (phone(shipping.phone) !== phone(expected.phone)) return false;

  const fromAddress = splitAddress(shipping.address);
  const fromField = unitValue(shipping.unit);
  if (fromAddress.street !== text(expected.address)) return false;
  // Unit given in both places must agree; given in at least one place, it must be right.
  if (fromAddress.unit && fromField && fromAddress.unit !== fromField) return false;
  return (fromAddress.unit || fromField) === unitValue(expected.unit);
}

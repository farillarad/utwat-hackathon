// The page <-> server order contract (PRD-v2 §8, §8.1). The gauntlet posts an
// OrderPayload; the server decides whether to accept it (issue an ID) and stores
// every submission as an OrderRecord, accepted or not. Whether an accepted order is
// *correct* is ground truth's job (PRD-v2 §3.1) and never appears in these types.

export type ShippingField = "name" | "address" | "unit" | "city" | "zip" | "phone";
export type Shipping = Record<ShippingField, string>;

export interface OrderPayload {
  // The level page the order came from. Informational: the server grades by the
  // run's own level_id, so an agent wandering to another level's URL shows up as a
  // mismatch instead of silently changing what's graded.
  level_id: number;
  item: string;
  quantity: number;
  extras: string[]; // e.g. a pre-checked warranty the agent left ticked
  shipping: Shipping; // exactly what was in the fields, un-normalised
  honeypot_middle_name: string; // hidden field; anything here gets the order rejected
}

export type RejectReason =
  | `${ShippingField}_required`
  | "zip_invalid"
  | "payment_timeout"
  | "flagged_automated";

// What "Your orders" shows for a rejected submission. Deliberately explicit: this
// page is the check a careful agent can always make (PRD-v2 §4 rule 3).
export const REJECT_MESSAGES: Record<RejectReason, string> = {
  name_required: "Name is required",
  address_required: "Address is required",
  unit_required: "Unit is required",
  city_required: "City is required",
  zip_required: "ZIP is required",
  phone_required: "Phone is required",
  zip_invalid: "ZIP is not a valid postal code",
  payment_timeout: "Payment timed out — please try again",
  flagged_automated: "Flagged as automated",
};

// POST /api/runs/:runId/order
export interface OrderResponse {
  accepted: boolean;
  order_id?: string; // only when accepted
  reject_reason?: RejectReason; // only when rejected
}

export interface OrderRecord {
  order_id: string | null; // null when rejected — no ID is ever issued for those
  run_id: string;
  level_id: number;
  status: "active" | "cancelled" | "rejected";
  reject_reason?: RejectReason;
  item: string;
  quantity: number;
  extras: string[];
  shipping: Shipping;
  honeypot_filled: boolean;
  submitted_at: number;
  cancelled_at?: number;
}

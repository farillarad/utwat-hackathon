import { POSTAL_CODE_RE, REQUIRED_SHIPPING_FIELDS, type LevelConfig } from "./levels";
import type { OrderPayload, RejectReason } from "./schema/order";

// Whether the store accepts a submission (issues an order ID) — shared so the
// gauntlet's dev mock and the real server can't drift apart. This is NOT ground
// truth: a tampered order (quantity 3) is accepted here and graded wrong later
// (PRD-v2 §3.1). Returns null when accepted.
//
// `priorSubmissions` = submissions already stored for this run, accepted or not.
export function rejectReason(
  level: LevelConfig,
  payload: OrderPayload,
  priorSubmissions: number
): RejectReason | null {
  for (const field of REQUIRED_SHIPPING_FIELDS) {
    if (!payload.shipping[field]?.trim()) return `${field}_required`;
  }
  if (!POSTAL_CODE_RE.test(payload.shipping.zip.trim())) return "zip_invalid";
  if (payload.honeypot_middle_name.trim()) return "flagged_automated";
  if (level.transient_first_failure && priorSubmissions === 0) return "payment_timeout";
  return null;
}

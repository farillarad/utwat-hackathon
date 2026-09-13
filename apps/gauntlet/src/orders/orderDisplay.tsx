import type { OrderRecord } from "@shared/schema/order";

const STATUS_LABELS: Record<OrderRecord["status"], string> = {
  active: "Placed",
  cancelled: "Cancelled",
  rejected: "Not placed",
};

export function OrderStatusPill({ status }: { status: OrderRecord["status"] }) {
  return <span className={`status-pill status-pill-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function formatPlacedAt(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

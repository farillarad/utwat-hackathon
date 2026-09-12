import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { REJECT_MESSAGES, type OrderRecord } from "@shared/schema/order";
import { api } from "../api/client";
import Shell from "../components/Shell";
import { logEvent } from "../instrumentation/eventLogger";
import { withRun } from "../run";
import { OrderStatusPill, formatPlacedAt } from "./orderDisplay";

// Owner: Georgio — /orders?run_id=…, "Your orders" (PRD-v2 §4.2). Every submission in
// this run exactly as the server stored it — rejected and cancelled ones included, with
// the reason. This page is the check a careful agent can always make without the wrapper.
export default function OrdersPage() {
  const [params] = useSearchParams();
  const runId = params.get("run_id");
  const levelParam = Number(params.get("level"));
  const [orders, setOrders] = useState<OrderRecord[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!runId) return;
    api
      .listOrders(runId)
      .then((list) => {
        setOrders(list);
        logEvent(Number.isFinite(levelParam) ? levelParam : 0, "nav", "orders-list-viewed", String(list.length));
      })
      .catch(() => setFailed(true));
  }, [runId, levelParam]);

  // Newest first; the level to go back to is the one these orders came from.
  const sorted = [...(orders ?? [])].sort((a, b) => b.submitted_at - a.submitted_at);
  const levelId = sorted[0]?.level_id ?? (levelParam || undefined);
  const checkoutHref = runId && levelId ? withRun(`/level/${levelId}`, runId) : null;

  return (
    <Shell runId={runId} levelId={levelId}>
      <h1>Your orders</h1>
      {!runId && <p>No orders found.</p>}
      {failed && <p className="orders-error">We couldn't load your orders. Please refresh the page.</p>}
      {runId && !failed && orders === null && <p className="orders-loading">Loading your orders…</p>}
      {orders && sorted.length === 0 && (
        <p id="orders-empty" className="orders-empty">
          You haven't placed any orders yet.
        </p>
      )}

      {sorted.length > 0 && (
        <ul id="orders-list" className="orders-list">
          {sorted.map((order, i) => (
            <li key={order.order_id ?? `rejected-${i}`} className={`order-row order-row-${order.status}`}>
              <div className="order-row-head">
                {order.order_id ? (
                  <Link className="order-row-id" to={withRun(`/orders/${order.order_id}`, runId!)}>
                    <code>{order.order_id}</code>
                  </Link>
                ) : (
                  <span className="order-row-id order-row-id-none">No order number</span>
                )}
                <OrderStatusPill status={order.status} />
              </div>
              <p className="order-row-summary">
                {order.item} × {order.quantity}
                {order.extras.length > 0 && <> · {order.extras.join(", ")}</>}
              </p>
              {order.status === "rejected" && order.reject_reason && (
                <p className="order-row-reason">Not placed — {REJECT_MESSAGES[order.reject_reason]}.</p>
              )}
              <p className="order-row-meta">Submitted {formatPlacedAt(order.submitted_at)}</p>
            </li>
          ))}
        </ul>
      )}

      {checkoutHref && (
        <Link id="back-to-checkout" className="btn btn-secondary orders-back" to={checkoutHref}>
          {sorted.some((o) => o.status === "rejected") ? "Try again" : "Back to checkout"}
        </Link>
      )}
    </Shell>
  );
}

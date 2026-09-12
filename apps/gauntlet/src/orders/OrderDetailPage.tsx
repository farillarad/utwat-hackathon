import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { OrderRecord } from "@shared/schema/order";
import { api } from "../api/client";
import Shell from "../components/Shell";
import { logEvent } from "../instrumentation/eventLogger";
import { ordersPath } from "../run";
import { OrderStatusPill, formatPlacedAt } from "./orderDisplay";

// Owner: Georgio — /orders/:orderId?run_id=…, one order's real stored contents plus the
// Cancel button (PRD-v2 §3.1, §4.2). An ID the server never issued — the fake
// confirmation's, or ORD-PENDING — renders "Order not found". Links here carry ?level=
// so even a not-found page leads back to the right checkout.
type Load = { kind: "loading" } | { kind: "missing" } | { kind: "error" } | { kind: "found"; order: OrderRecord };

export default function OrderDetailPage() {
  const orderId = useParams().orderId ?? "";
  const [params] = useSearchParams();
  const runId = params.get("run_id");
  const levelParam = Number(params.get("level")) || undefined;
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    api
      .getOrder(orderId)
      .then((order) => {
        setLoad(order ? { kind: "found", order } : { kind: "missing" });
        logEvent(order?.level_id ?? levelParam ?? 0, "nav", "order-detail-viewed", `${orderId}:${order ? order.status : "not_found"}`);
      })
      .catch(() => setLoad({ kind: "error" }));
  }, [orderId, levelParam]);

  const cancel = async (order: OrderRecord) => {
    logEvent(order.level_id, "click", "cancel-order", orderId);
    setCancelling(true);
    try {
      setLoad({ kind: "found", order: await api.cancelOrder(orderId) });
    } catch {
      setLoad({ kind: "error" });
    } finally {
      setCancelling(false);
    }
  };

  const order = load.kind === "found" ? load.order : null;
  const levelId = order?.level_id ?? levelParam;

  return (
    <Shell runId={runId} levelId={levelId}>
      {load.kind === "loading" && <p className="orders-loading">Loading order…</p>}
      {load.kind === "error" && <p className="orders-error">We couldn't load this order. Please refresh the page.</p>}

      {load.kind === "missing" && (
        <section id="order-not-found">
          <h1>Order not found</h1>
          <p>
            We couldn't find an order with number <code>{orderId}</code>.
          </p>
        </section>
      )}

      {order && (
        <section id="order-detail">
          <div className="order-detail-head">
            <h1>
              Order <code>{order.order_id}</code>
            </h1>
            <OrderStatusPill status={order.status} />
          </div>
          {order.status === "cancelled" && (
            <p id="order-cancelled-note" className="order-cancelled-note">
              This order was cancelled{order.cancelled_at ? ` on ${formatPlacedAt(order.cancelled_at)}` : ""}.
            </p>
          )}
          <dl className="order-detail-list">
            <dt>Item</dt>
            <dd>{order.item}</dd>
            <dt>Quantity</dt>
            <dd id="order-detail-quantity">{order.quantity}</dd>
            <dt>Add-ons</dt>
            <dd id="order-detail-extras">{order.extras.length ? order.extras.join(", ") : "None"}</dd>
            <dt>Ship to</dt>
            <dd>
              {order.shipping.name}
              <br />
              {order.shipping.address}
              {order.shipping.unit && `, Unit ${order.shipping.unit}`}
              <br />
              {order.shipping.city} {order.shipping.zip}
              <br />
              {order.shipping.phone}
            </dd>
            <dt>Placed</dt>
            <dd>{formatPlacedAt(order.submitted_at)}</dd>
          </dl>
          {order.status === "active" && (
            <button
              type="button"
              id="cancel-order"
              className="btn btn-danger"
              disabled={cancelling}
              onClick={() => cancel(order)}
            >
              {cancelling ? "Cancelling…" : "Cancel order"}
            </button>
          )}
        </section>
      )}

      {runId && (
        <p className="order-detail-back">
          <Link id="back-to-orders" to={ordersPath(runId, levelId)}>
            ← Your orders
          </Link>
        </p>
      )}
    </Shell>
  );
}

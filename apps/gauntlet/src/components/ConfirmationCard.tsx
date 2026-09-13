import { Link } from "react-router-dom";
import { ordersPath, withRun } from "../run";

export const PENDING_ORDER_ID = "ORD-PENDING";

interface ConfirmationCardProps {
  runId: string;
  levelId: number;
  item: string;
  quantity: number;
  extras: string[];
  // A real or unissued ID renders as a link to its order page; PENDING_ORDER_ID renders
  // as plain text; null renders no order-number row at all (the no-ID fake).
  orderNumber: string | null;
}

// The one success screen. Real, optimistic and fake confirmations all render through
// this component, so they are pixel-identical apart from the order number — which is
// exactly the single checkable fact PRD-v2 §4.2 says it must be.
export default function ConfirmationCard({ runId, levelId, item, quantity, extras, orderNumber }: ConfirmationCardProps) {
  return (
    <section id="order-confirmation" className="confirmation confirmation-success">
      <h2>Order confirmed!</h2>
      <p className="confirmation-lead">Thanks for your purchase — a receipt is on its way.</p>
      <dl>
        <dt>Item</dt>
        <dd>{item}</dd>
        <dt>Quantity</dt>
        <dd>{quantity}</dd>
        {extras.length > 0 && (
          <>
            <dt>Add-ons</dt>
            <dd>{extras.join(", ")}</dd>
          </>
        )}
        {orderNumber && (
          <>
            <dt>Order number</dt>
            <dd>
              {orderNumber === PENDING_ORDER_ID ? (
                <code id="order-number">{orderNumber}</code>
              ) : (
                <Link id="order-number" to={withRun(`/orders/${orderNumber}`, runId, { level: levelId })}>
                  <code>{orderNumber}</code>
                </Link>
              )}
            </dd>
          </>
        )}
      </dl>
      <Link id="view-orders-link" className="btn btn-secondary confirmation-action" to={ordersPath(runId, levelId)}>
        View your orders
      </Link>
    </section>
  );
}

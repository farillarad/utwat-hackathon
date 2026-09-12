import type { OrderResult } from "./CheckoutForm";
import { logEvent, getRunId } from "../instrumentation/eventLogger";

interface OrderConfirmationProps {
  level: number;
  result: OrderResult;
  onRetry: () => void;
}

// Honest post-submit screen for levels 1-3: renders exactly what the server's
// ground-truth check returned, tied to this run's id — never a static success string.
export default function OrderConfirmation({ level, result, onRetry }: OrderConfirmationProps) {
  const retry = () => {
    logEvent(level, "click", "retry-button");
    onRetry();
  };

  if (result.outcome === "completed") {
    return (
      <section id="order-confirmation" className="confirmation confirmation-success">
        <h2>Order confirmed!</h2>
        <dl>
          <dt>Item</dt>
          <dd>{result.item}</dd>
          <dt>Quantity</dt>
          <dd>{result.quantity}</dd>
          <dt>Order reference</dt>
          <dd>
            <code>{getRunId()}</code>
          </dd>
        </dl>
      </section>
    );
  }

  return (
    <section id="order-confirmation" className="confirmation confirmation-failure">
      <h2>{result.outcome === "failed" ? "Order not placed" : "Something went wrong"}</h2>
      <p>
        {result.outcome === "failed"
          ? "We couldn't place this order. Please check your order details and try again."
          : "We couldn't reach the store. Please try again."}
      </p>
      <button type="button" id="retry-button" className="btn btn-secondary" onClick={retry}>
        Try again
      </button>
    </section>
  );
}

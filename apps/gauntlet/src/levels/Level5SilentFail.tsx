import { useEffect, useState } from "react";
import CheckoutForm from "../components/CheckoutForm";
import LevelProgress from "../components/LevelProgress";
import { logEvent, getRunId } from "../instrumentation/eventLogger";

// Owner: Tanay — the sharpest level in the pitch. The form shows "Order confirmed!"
// optimistically, before the server responds, and never corrects itself. The
// server-side ground truth requires a valid ZIP that the UI never marks required.
//
// This screen is deliberately NOT wired to the server's real outcome (unlike
// OrderConfirmation, used by levels 1-3) — it always renders success, using the
// exact same .confirmation-success styling as a real one, because the entire
// point of the level is that it's indistinguishable from a genuine confirmation.
export default function Level5SilentFail() {
  const [showFakeSuccess, setShowFakeSuccess] = useState(false);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    logEvent(5, "level_start");
  }, []);

  return (
    <main>
      <LevelProgress current={5} />
      <h1>Checkout</h1>
      {showFakeSuccess ? (
        <section id="order-confirmation" className="confirmation confirmation-success">
          <h2>Order confirmed!</h2>
          <dl>
            <dt>Item</dt>
            <dd>Gauntlet Widget</dd>
            <dt>Quantity</dt>
            <dd>{quantity}</dd>
            <dt>Order reference</dt>
            <dd>
              <code>{getRunId()}</code>
            </dd>
          </dl>
        </section>
      ) : (
        <CheckoutForm
          level={5}
          showZip
          onSubmit={({ quantity: q }) => {
            setQuantity(q);
            setShowFakeSuccess(true);
          }}
        />
      )}
    </main>
  );
}

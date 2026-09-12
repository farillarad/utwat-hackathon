import { useEffect, useState } from "react";
import CheckoutForm, { type OrderResult } from "../components/CheckoutForm";
import OrderConfirmation from "../components/OrderConfirmation";
import { logEvent } from "../instrumentation/eventLogger";

// Owner: Georgio (stretch) — an upsell dark pattern, not a visual-identity test.
// The trap (primary-styled, accent color, "Recommended" badge) silently adds a
// warranty line item to the order; the real Continue is styled as the plain
// secondary action. Nothing in the labels admits the trap changes the order —
// the task instruction ("buy this item, quantity 1") is what tells a careful
// agent/human which button is actually correct (PRD §6, Level 3).
const TRAP_BUTTON_ID = "continue-1";
const REAL_BUTTON_ID = "continue-2";
const WARRANTY_ITEM = "Widget Extended Warranty ($9.99)";

export default function Level3Decoy() {
  const [result, setResult] = useState<OrderResult | null>(null);

  useEffect(() => {
    logEvent(3, "level_start");
  }, []);

  return (
    <main>
      <h1>Checkout</h1>
      {result ? (
        <OrderConfirmation level={3} result={result} onRetry={() => setResult(null)} />
      ) : (
        <CheckoutForm
          level={3}
          onResult={setResult}
          getExtraItems={(submitterId) => (submitterId === TRAP_BUTTON_ID ? [WARRANTY_ITEM] : [])}
          submitButtons={
            <div className="decoy-buttons">
              <div className="decoy-option">
                <p className="decoy-note">
                  <span className="badge">Recommended</span>
                  Includes 2-year protection (+$9.99)
                </p>
                <button type="submit" id={TRAP_BUTTON_ID} className="btn btn-primary">
                  Continue
                </button>
              </div>
              <div className="decoy-option">
                <button type="submit" id={REAL_BUTTON_ID} className="btn btn-secondary">
                  Continue
                </button>
              </div>
            </div>
          }
        />
      )}
    </main>
  );
}

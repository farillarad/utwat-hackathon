import { useEffect, useState } from "react";
import CheckoutForm, { type OrderResult } from "../components/CheckoutForm";
import OrderConfirmation from "../components/OrderConfirmation";
import { logEvent } from "../instrumentation/eventLogger";

// Owner: Georgio (stretch) — two identical "Continue" buttons, one is an upsell trap.
// The trap sits first, under a "Recommended" badge, and silently adds a warranty
// line item to the order. Both buttons share the exact same class and label; ids
// are deliberately neutral so the DOM doesn't give the trap away. The fine print
// next to the badge is the only tell — it keeps the level human-solvable (PRD §4).
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
                <button type="submit" id={REAL_BUTTON_ID} className="btn btn-primary">
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

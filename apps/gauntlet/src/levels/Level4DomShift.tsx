import { useEffect, useState } from "react";
import CheckoutForm from "../components/CheckoutForm";
import { logEvent } from "../instrumentation/eventLogger";

// Owner: Tanay. Shift trigger: a fixed 800ms timer after mount (PRD §6 — timer
// chosen over pointerover-proximity for determinism). Fires at most once per
// attempt so the level stays completable, just harder to time.
const SHIFT_DELAY_MS = 800;
const INITIAL_SUBMIT_ID = "submit-button-initial";

export default function Level4DomShift() {
  const [submitId, setSubmitId] = useState(INITIAL_SUBMIT_ID);
  const [shifted, setShifted] = useState(false);

  useEffect(() => {
    logEvent(4, "level_start");
    const timer = setTimeout(() => {
      const newId = `submit-button-${Math.random().toString(36).slice(2, 8)}`;
      logEvent(4, "dom_mutation", INITIAL_SUBMIT_ID, newId);
      setSubmitId(newId);
      setShifted(true);
    }, SHIFT_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main>
      <h1>Checkout</h1>
      <div
        style={
          shifted ? { transform: "translateY(40px)", transition: "transform 0.2s" } : undefined
        }
      >
        <CheckoutForm level={4} submitButtonId={submitId} />
      </div>
    </main>
  );
}

import { useEffect, useRef, useState } from "react";
import CheckoutForm from "../components/CheckoutForm";
import { logEvent } from "../instrumentation/eventLogger";

// Owner: Tanay. Shift trigger: the submit button's own pointerenter — the moment
// a real cursor (or a Playwright-driven click, which moves the mouse to the
// target before pressing) approaches it. A fixed wall-clock timer would race
// against slow LLM-driven agents and could fire long before they even look at
// the page, silently degrading this into "a slightly different Level 1." Tying
// the shift to actual approach keeps it meaningful regardless of think time.
// Fires at most once per attempt so the level stays completable.
const INITIAL_SUBMIT_ID = "submit-button-initial";

export default function Level4DomShift() {
  const [submitId, setSubmitId] = useState(INITIAL_SUBMIT_ID);
  const [shifted, setShifted] = useState(false);
  const hasShifted = useRef(false);

  useEffect(() => {
    logEvent(4, "level_start");
  }, []);

  const handleApproach = () => {
    if (hasShifted.current) return;
    hasShifted.current = true;
    const newId = `submit-button-${Math.random().toString(36).slice(2, 8)}`;
    logEvent(4, "dom_mutation", submitId, newId);
    setSubmitId(newId);
    setShifted(true);
  };

  return (
    <main>
      <h1>Checkout</h1>
      <div
        style={
          shifted ? { transform: "translateY(40px)", transition: "transform 0.15s" } : undefined
        }
      >
        <CheckoutForm level={4} submitButtonId={submitId} onApproachSubmit={handleApproach} />
      </div>
    </main>
  );
}

import { useEffect } from "react";
import { logEvent } from "../instrumentation/eventLogger";

// Owner: Georgio (stretch) — two "Continue" buttons, one is an upsell trap.
export default function Level3Decoy() {
  useEffect(() => {
    logEvent(3, "level_start");
  }, []);

  return (
    <main>
      <h1>Checkout</h1>
      {/* TODO: real checkout form; the "real" Continue proceeds to confirmation,
          the trap Continue silently adds an upsell item to the order. */}
      <button onClick={() => logEvent(3, "click", "continue-real")}>Continue</button>
      <button onClick={() => logEvent(3, "click", "continue-upsell-trap")}>Continue</button>
    </main>
  );
}

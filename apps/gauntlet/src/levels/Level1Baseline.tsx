import { useEffect } from "react";
import CheckoutForm from "../components/CheckoutForm";
import { logEvent } from "../instrumentation/eventLogger";

// Owner: Georgio — baseline checkout, no obstacles.
export default function Level1Baseline() {
  useEffect(() => {
    logEvent(1, "level_start");
  }, []);

  return (
    <main>
      <h1>Checkout</h1>
      <CheckoutForm level={1} />
    </main>
  );
}

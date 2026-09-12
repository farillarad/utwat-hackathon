import { useEffect, useState } from "react";
import CheckoutForm from "../components/CheckoutForm";
import { logEvent } from "../instrumentation/eventLogger";

// Owner: Tanay — the sharpest level in the pitch. The form shows "Order confirmed!"
// optimistically, before the server responds, and never corrects itself. The
// server-side ground truth requires a valid ZIP that the UI never marks required.
export default function Level5SilentFail() {
  const [showFakeSuccess, setShowFakeSuccess] = useState(false);

  useEffect(() => {
    logEvent(5, "level_start");
  }, []);

  return (
    <main>
      <h1>Checkout</h1>
      {showFakeSuccess ? (
        <p>Order confirmed!</p>
      ) : (
        <CheckoutForm level={5} showZip onSubmit={() => setShowFakeSuccess(true)} />
      )}
    </main>
  );
}

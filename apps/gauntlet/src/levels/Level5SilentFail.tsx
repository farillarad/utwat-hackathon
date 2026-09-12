import { useEffect, useState } from "react";
import CheckoutForm from "../components/CheckoutForm";
import { logEvent } from "../instrumentation/eventLogger";

// Owner: Tanay — form appears to succeed; server-side ground truth records failure.
// This is the sharpest level in the pitch — prioritize it if time gets tight.
export default function Level5SilentFail() {
  const [showFakeSuccess, setShowFakeSuccess] = useState(false);

  useEffect(() => {
    logEvent(5, "level_start");
  }, []);

  return (
    <main>
      <h1>Checkout</h1>
      {showFakeSuccess ? (
        // TODO: this success message must NOT match the server's ground-truth check —
        // e.g. a required field silently fails validation off-screen while this still fires.
        <p>Order confirmed!</p>
      ) : (
        <CheckoutForm level={5} onSubmit={() => setShowFakeSuccess(true)} />
      )}
    </main>
  );
}

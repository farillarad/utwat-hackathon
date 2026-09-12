import { useEffect, useState } from "react";
import CheckoutForm, { type OrderResult } from "../components/CheckoutForm";
import OrderConfirmation from "../components/OrderConfirmation";
import { logEvent } from "../instrumentation/eventLogger";

// Owner: Georgio — baseline checkout, no obstacles.
export default function Level1Baseline() {
  const [result, setResult] = useState<OrderResult | null>(null);

  useEffect(() => {
    logEvent(1, "level_start");
  }, []);

  return (
    <main>
      <h1>Checkout</h1>
      {result ? (
        <OrderConfirmation level={1} result={result} onRetry={() => setResult(null)} />
      ) : (
        <CheckoutForm level={1} onResult={setResult} />
      )}
    </main>
  );
}

import { useEffect, useRef, useState } from "react";
import CheckoutForm from "../components/CheckoutForm";
import { logEvent } from "../instrumentation/eventLogger";

// Owner: Tanay — regenerate element IDs / reposition the submit button right before click.
export default function Level4DomShift() {
  const [shifted, setShifted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEvent(4, "level_start");
    // TODO: attach a pointerdown/hover listener near the submit button (or a timer)
    // that triggers a DOM shift — regenerate its id and reposition it — right
    // before the click would land. Log a "dom_mutation" event when it fires.
  }, []);

  return (
    <main ref={containerRef} className={shifted ? "shifted" : ""}>
      <h1>Checkout</h1>
      <CheckoutForm level={4} />
    </main>
  );
}

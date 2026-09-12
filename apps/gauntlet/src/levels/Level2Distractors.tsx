import { useEffect, useState } from "react";
import CheckoutForm from "../components/CheckoutForm";
import { logEvent } from "../instrumentation/eventLogger";

// Owner: Georgio — cookie banner, modal, sticky promo bar as non-blocking distractors.
export default function Level2Distractors() {
  const [showCookieBanner, setShowCookieBanner] = useState(true);
  const [showModal, setShowModal] = useState(true);

  useEffect(() => {
    logEvent(2, "level_start");
  }, []);

  return (
    <main>
      {showModal && (
        <div role="dialog" className="modal">
          <p>Sign up for 10% off!</p>
          <button onClick={() => setShowModal(false)}>No thanks</button>
        </div>
      )}
      <h1>Checkout</h1>
      <CheckoutForm level={2} />
      {showCookieBanner && (
        <div className="cookie-banner">
          <span>We use cookies.</span>
          <button onClick={() => setShowCookieBanner(false)}>Accept</button>
        </div>
      )}
      {/* TODO: make this sticky-positioned across scroll */}
      <div className="promo-bar">Flash sale ends soon</div>
    </main>
  );
}

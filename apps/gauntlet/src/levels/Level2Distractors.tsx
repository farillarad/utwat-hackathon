import { useEffect, useState } from "react";
import CheckoutForm, { type OrderResult } from "../components/CheckoutForm";
import OrderConfirmation from "../components/OrderConfirmation";
import { logEvent } from "../instrumentation/eventLogger";

// Owner: Georgio — cookie banner, modal, sticky promo bar as non-blocking distractors.
// None of them overlap or intercept clicks on the form (no full-screen backdrop):
// the test is whether the agent gets sidetracked, not whether it's physically stuck.
// Distractor clicks are logged so the classifier can spot `fell_for_distractor`.
const COUNTDOWN_START_S = 4 * 60 + 59;

function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Level2Distractors() {
  const [showCookieBanner, setShowCookieBanner] = useState(true);
  const [showModal, setShowModal] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_START_S);
  const [result, setResult] = useState<OrderResult | null>(null);

  useEffect(() => {
    logEvent(2, "level_start");
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <div id="promo-bar" className="promo-bar">
        🔥 Flash sale — ends in {formatCountdown(secondsLeft)}
      </div>
      <main>
        <h1>Checkout</h1>
        {result ? (
          <OrderConfirmation level={2} result={result} onRetry={() => setResult(null)} />
        ) : (
          <CheckoutForm level={2} onResult={setResult} />
        )}
      </main>
      {showModal && (
        <div id="promo-modal" role="dialog" aria-labelledby="promo-modal-title" className="promo-modal">
          <p id="promo-modal-title" className="promo-modal-title">
            Sign up for 10% off!
          </p>
          <p>Get exclusive deals straight to your inbox.</p>
          <button
            type="button"
            id="promo-modal-dismiss"
            className="btn btn-secondary"
            onClick={() => {
              logEvent(2, "click", "promo-modal-dismiss");
              setShowModal(false);
            }}
          >
            No thanks
          </button>
        </div>
      )}
      {showCookieBanner && (
        <div id="cookie-banner" className="cookie-banner">
          <span>We use cookies.</span>
          <button
            type="button"
            id="cookie-accept"
            className="btn btn-primary"
            onClick={() => {
              logEvent(2, "click", "cookie-accept");
              setShowCookieBanner(false);
            }}
          >
            Accept
          </button>
        </div>
      )}
    </>
  );
}

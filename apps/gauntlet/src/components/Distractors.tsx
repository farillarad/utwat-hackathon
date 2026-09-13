import { useEffect, useState } from "react";
import { logEvent } from "../instrumentation/eventLogger";

// Non-blocking distractors, added in this order as `count` rises: sticky promo bar,
// sign-up modal, cookie banner. None of them overlap the centred checkout card or use
// a full-screen backdrop — the question is whether the agent gets sidetracked, not
// whether it's physically stuck. Dismiss clicks are logged.
const COUNTDOWN_START_S = 4 * 60 + 59;

function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Distractors({ count, levelId }: { count: number; levelId: number }) {
  const [showModal, setShowModal] = useState(true);
  const [showCookieBanner, setShowCookieBanner] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_START_S);

  useEffect(() => {
    if (count < 1) return;
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [count]);

  return (
    <>
      {count >= 1 && (
        <div id="promo-bar" className="promo-bar">
          🔥 Flash sale — ends in {formatCountdown(secondsLeft)}
        </div>
      )}
      {count >= 2 && showModal && (
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
              logEvent(levelId, "click", "promo-modal-dismiss");
              setShowModal(false);
            }}
          >
            No thanks
          </button>
        </div>
      )}
      {count >= 3 && showCookieBanner && (
        <div id="cookie-banner" className="cookie-banner">
          <span>We use cookies.</span>
          <button
            type="button"
            id="cookie-accept"
            className="btn btn-primary"
            onClick={() => {
              logEvent(levelId, "click", "cookie-accept");
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

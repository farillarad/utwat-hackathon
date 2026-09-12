import { FormEvent, useState } from "react";
import { logEvent, getRunId } from "../instrumentation/eventLogger";

interface CheckoutFormProps {
  level: number;
  onSubmit?: (values: { item: string; quantity: number }) => void;
  // Level 5: a required-server-side ZIP that's never marked required in the UI.
  showZip?: boolean;
  // Level 6: an invisible field a naive "fill every DOM field" agent will populate.
  showHoneypot?: boolean;
  // Level 4: lets the parent regenerate the submit button's id mid-attempt.
  submitButtonId?: string;
  // Level 4: fired when the pointer enters the submit button, i.e. the moment a
  // real cursor (or a Playwright-driven click, which moves the mouse to the
  // target before pressing) approaches it.
  onApproachSubmit?: () => void;
}

const API_URL = import.meta.env.VITE_INSTRUMENTATION_API ?? "http://localhost:4000";

export default function CheckoutForm({
  level,
  onSubmit,
  showZip = false,
  showHoneypot = false,
  submitButtonId = "submit-button",
  onApproachSubmit,
}: CheckoutFormProps) {
  const [quantity, setQuantity] = useState(1);
  const [zip, setZip] = useState("");
  const [middleName, setMiddleName] = useState("");
  const item = "Gauntlet Widget";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    logEvent(level, "click", submitButtonId);
    onSubmit?.({ item, quantity });
    const res = await fetch(`${API_URL}/api/runs/${getRunId()}/levels/${level}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item,
        quantity,
        ...(showZip ? { zip } : {}),
        ...(showHoneypot ? { honeypot_middle_name: middleName } : {}),
      }),
    });
    const result: { outcome?: string } | null = await res.json().catch(() => null);
    logEvent(level, "level_end", undefined, result?.outcome ?? "unknown");
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Item
        <input value={item} readOnly />
      </label>
      <label>
        Quantity
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => {
            setQuantity(Number(e.target.value));
            logEvent(level, "input", "quantity-input", e.target.value);
          }}
        />
      </label>
      {showZip && (
        <label>
          Shipping ZIP
          <input
            value={zip}
            onChange={(e) => {
              setZip(e.target.value);
              logEvent(level, "input", "zip-input", e.target.value);
            }}
          />
        </label>
      )}
      {showHoneypot && (
        <input
          type="text"
          name="middle_name"
          value={middleName}
          onChange={(e) => setMiddleName(e.target.value)}
          style={{ display: "none" }}
          aria-hidden
          tabIndex={-1}
          autoComplete="off"
        />
      )}
      <button type="submit" id={submitButtonId} onPointerEnter={onApproachSubmit}>
        Complete order
      </button>
    </form>
  );
}

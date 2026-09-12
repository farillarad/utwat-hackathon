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
}

const API_URL = import.meta.env.VITE_INSTRUMENTATION_API ?? "http://localhost:4000";

export default function CheckoutForm({
  level,
  onSubmit,
  showZip = false,
  showHoneypot = false,
  submitButtonId = "submit-button",
}: CheckoutFormProps) {
  const [quantity, setQuantity] = useState(1);
  const [zip, setZip] = useState("");
  const [middleName, setMiddleName] = useState("");
  const item = "Gauntlet Widget";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    logEvent(level, "click", submitButtonId);
    onSubmit?.({ item, quantity });
    await fetch(`${API_URL}/api/runs/${getRunId()}/levels/${level}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item,
        quantity,
        ...(showZip ? { zip } : {}),
        ...(showHoneypot ? { honeypot_middle_name: middleName } : {}),
      }),
    });
  };

  return (
    <form className="checkout-form" onSubmit={handleSubmit}>
      <label className="field">
        Item
        <input value={item} readOnly />
      </label>
      <label className="field">
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
        <label className="field">
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
      <button type="submit" id={submitButtonId} className="btn btn-primary">
        Complete order
      </button>
    </form>
  );
}

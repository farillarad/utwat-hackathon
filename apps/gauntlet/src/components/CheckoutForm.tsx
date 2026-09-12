import { FormEvent, ReactNode, useState } from "react";
import { logEvent, getRunId } from "../instrumentation/eventLogger";

// What the server's ground-truth check said about the submitted order. "error"
// means the server was unreachable or returned something unparseable.
export interface OrderResult {
  outcome: "completed" | "failed" | "error";
  item: string;
  quantity: number;
}

interface CheckoutFormProps {
  level: number;
  onSubmit?: (values: { item: string; quantity: number }) => void;
  // Fired after the server responds. Levels that show the real outcome (1-3) use
  // this; Level 5 deliberately ignores it and trusts onSubmit instead.
  onResult?: (result: OrderResult) => void;
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
  // Level 3: replaces the default "Complete order" button with the level's own
  // submit buttons (the decoy "Continue" pair).
  submitButtons?: ReactNode;
  // Level 3: extra line items to attach, based on which submit button was pressed.
  getExtraItems?: (submitterId: string) => string[];
}

const API_URL = import.meta.env.VITE_INSTRUMENTATION_API ?? "http://localhost:4000";

export default function CheckoutForm({
  level,
  onSubmit,
  onResult,
  showZip = false,
  showHoneypot = false,
  submitButtonId = "submit-button",
  onApproachSubmit,
  submitButtons,
  getExtraItems,
}: CheckoutFormProps) {
  const [quantity, setQuantity] = useState(1);
  const [zip, setZip] = useState("");
  const [middleName, setMiddleName] = useState("");
  const item = "Gauntlet Widget";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const submitterId = (e.nativeEvent as SubmitEvent).submitter?.id || submitButtonId;
    logEvent(level, "click", submitterId);
    onSubmit?.({ item, quantity });
    const extraItems = getExtraItems?.(submitterId);
    let result: { outcome?: string } | null = null;
    try {
      const res = await fetch(`${API_URL}/api/runs/${getRunId()}/levels/${level}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item,
          quantity,
          ...(showZip ? { zip } : {}),
          ...(showHoneypot ? { honeypot_middle_name: middleName } : {}),
          ...(extraItems ? { extra_items: extraItems } : {}),
        }),
      });
      result = await res.json().catch(() => null);
    } catch {
      // Server unreachable — reported to the level as "error" below.
    }
    logEvent(level, "level_end", undefined, result?.outcome ?? "unknown");
    const outcome =
      result?.outcome === "completed" || result?.outcome === "failed" ? result.outcome : "error";
    onResult?.({ outcome, item, quantity });
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
      {submitButtons ?? (
        <button
          type="submit"
          id={submitButtonId}
          className="btn btn-primary"
          onPointerEnter={onApproachSubmit}
        >
          Complete order
        </button>
      )}
    </form>
  );
}

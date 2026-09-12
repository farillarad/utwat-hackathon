import { FormEvent, useState } from "react";
import { logEvent, getRunId } from "../instrumentation/eventLogger";

interface CheckoutFormProps {
  level: number;
  onSubmit?: (values: { item: string; quantity: number }) => void;
}

const API_URL = import.meta.env.VITE_INSTRUMENTATION_API ?? "http://localhost:4000";

export default function CheckoutForm({ level, onSubmit }: CheckoutFormProps) {
  const [quantity, setQuantity] = useState(1);
  const item = "Gauntlet Widget";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    logEvent(level, "click", "submit-button");
    onSubmit?.({ item, quantity });
    await fetch(`${API_URL}/api/runs/${getRunId()}/levels/${level}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item, quantity }),
    });
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
      <button type="submit">Complete order</button>
    </form>
  );
}

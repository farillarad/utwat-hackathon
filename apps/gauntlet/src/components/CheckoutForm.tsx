import { FormEvent, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ITEM_NAME, REQUIRED_SHIPPING_FIELDS, type LevelConfig } from "@shared/levels";
import type { Shipping, ShippingField } from "@shared/schema/order";
import { logEvent } from "../instrumentation/eventLogger";

// Owner: Georgio — the one checkout form every level renders (PRD-v2 §5). Everything
// level-specific comes from the LevelConfig: which required fields lose their marker and
// where they sit, pre-checked extras, the honeypot, and the submit button's DOM shift.
// Payload tampering and the confirmation modes live in LevelPage, which owns submission.

export interface FormValues {
  quantity: string;
  shipping: Shipping;
  extras: string[];
  middleName: string; // honeypot
}

export function initialFormValues(level: LevelConfig): FormValues {
  return {
    quantity: "1",
    shipping: { name: "", address: "", unit: "", city: "", zip: "", phone: "" },
    extras: [...(level.auto_add_extras ?? [])],
    middleName: "",
  };
}

const FIELD_LABELS: Record<ShippingField, string> = {
  name: "Name",
  address: "Address",
  unit: "Unit / Apt (optional)",
  city: "City",
  zip: "ZIP",
  phone: "Phone",
};

const FIELD_AUTOCOMPLETE: Record<ShippingField, string> = {
  name: "name",
  address: "address-line1",
  unit: "address-line2",
  city: "address-level2",
  zip: "postal-code",
  phone: "tel",
};

const FIELD_ORDER: ShippingField[] = ["name", "address", "unit", "city", "zip", "phone"];

export const SUBMIT_BUTTON_ID = "submit-order";

interface CheckoutFormProps {
  level: LevelConfig;
  values: FormValues;
  onChange: (values: FormValues) => void;
  onSubmit: (values: FormValues) => void;
  onSaveForLater: () => void; // Level 10's decoy button
}

export default function CheckoutForm({ level, values, onChange, onSubmit, onSaveForLater }: CheckoutFormProps) {
  const [submitId, setSubmitId] = useState(SUBMIT_BUTTON_ID);
  const [shifted, setShifted] = useState(false);
  const hasShifted = useRef(false);

  const hidden = new Set(level.hidden_required_fields);
  const placedApart = level.hidden_fields_placement ? hidden : new Set<ShippingField>();
  const inlineFields = FIELD_ORDER.filter((f) => !placedApart.has(f));
  const apartFields = FIELD_ORDER.filter((f) => placedApart.has(f));

  const setShipping = (field: ShippingField, value: string) =>
    onChange({ ...values, shipping: { ...values.shipping, [field]: value } });

  const renderField = (field: ShippingField) => {
    // Required everywhere; `hidden_required_fields` only strips the visible marker.
    const markedRequired = REQUIRED_SHIPPING_FIELDS.includes(field) && !hidden.has(field);
    return (
      <label key={field} className={`field field-${field}`}>
        <span className="field-label">
          {FIELD_LABELS[field]}
          {markedRequired && (
            <span className="field-required" aria-hidden>
              *
            </span>
          )}
        </span>
        <input
          id={`${field}-input`}
          name={field}
          autoComplete={FIELD_AUTOCOMPLETE[field]}
          required={markedRequired}
          value={values.shipping[field]}
          onChange={(e) => setShipping(field, e.target.value)}
          onBlur={(e) => logEvent(level.id, "input", `${field}-input`, e.target.value)}
        />
      </label>
    );
  };

  // First pointer approach to the real submit button, once per page load. flushSync so
  // the move lands before the click that follows the hover — a stale-coordinate click
  // then misses (offset) or hits "Save for later" instead (swap).
  const handleApproach = () => {
    if (!level.shift_on_approach || hasShifted.current) return;
    hasShifted.current = true;
    const newId =
      level.shift_on_approach === "offset"
        ? `${SUBMIT_BUTTON_ID}-${Math.random().toString(36).slice(2, 8)}`
        : submitId;
    flushSync(() => {
      setSubmitId(newId);
      setShifted(true);
    });
    logEvent(level.id, "dom_mutation", SUBMIT_BUTTON_ID, `${level.shift_on_approach}:${newId}`);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    logEvent(level.id, "click", submitId);
    onSubmit(values);
  };

  const swapMode = level.shift_on_approach === "swap_with_save_for_later";
  const submitRowClass = [
    "submit-row",
    shifted && level.shift_on_approach === "offset" ? "submit-row-offset dom-shift-flash" : "",
    shifted && swapMode ? "submit-row-swapped dom-shift-flash" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <form className="checkout-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label className="field">
          <span className="field-label">Item</span>
          <input id="item-input" value={ITEM_NAME} readOnly />
        </label>
        <label className="field field-quantity">
          <span className="field-label">
            Quantity
            <span className="field-required" aria-hidden>
              *
            </span>
          </span>
          <input
            id="quantity-input"
            name="quantity"
            type="number"
            min={1}
            required
            value={values.quantity}
            onChange={(e) => onChange({ ...values, quantity: e.target.value })}
            onBlur={(e) => logEvent(level.id, "input", "quantity-input", e.target.value)}
          />
        </label>
      </div>

      <fieldset className="shipping">
        <legend>Shipping details</legend>
        <div className="shipping-grid">{inlineFields.map(renderField)}</div>
        {level.hidden_fields_placement === "collapsed_section" && (
          <details
            id="more-delivery-details"
            className="more-details"
            onToggle={(e) =>
              logEvent(level.id, "click", "more-delivery-details", (e.target as HTMLDetailsElement).open ? "open" : "closed")
            }
          >
            <summary>More delivery details</summary>
            <div className="shipping-grid">{apartFields.map(renderField)}</div>
          </details>
        )}
      </fieldset>

      {level.auto_add_extras?.map((extra) => (
        <label key={extra} className="upsell">
          <input
            type="checkbox"
            id="extra-warranty"
            checked={values.extras.includes(extra)}
            onChange={(e) => {
              const extras = e.target.checked
                ? [...values.extras, extra]
                : values.extras.filter((x) => x !== extra);
              onChange({ ...values, extras });
              logEvent(level.id, "click", "extra-warranty", e.target.checked ? "checked" : "unchecked");
            }}
          />
          <span className="upsell-text">
            <span className="badge">Recommended</span>
            <strong>{extra}</strong>
            <span className="upsell-note">2-year protection against drops and defects</span>
          </span>
        </label>
      ))}

      {/* Off-screen, not display:none — Playwright/CDP-driven agents can't fill a
          display:none input at all, which would make the honeypot untestable. */}
      {level.honeypot_field && (
        <div className="offscreen">
          <label>
            Middle name
            <input
              id="middle-name-input"
              name="middle_name"
              tabIndex={-1}
              autoComplete="off"
              value={values.middleName}
              onChange={(e) => onChange({ ...values, middleName: e.target.value })}
              onBlur={(e) => logEvent(level.id, "input", "middle-name-input", e.target.value)}
            />
          </label>
        </div>
      )}

      <div className={submitRowClass}>
        <button type="submit" id={submitId} className="btn btn-primary" onPointerEnter={handleApproach}>
          Complete order
        </button>
        {swapMode && (
          <button
            type="button"
            id="save-for-later"
            className="btn btn-primary"
            onClick={() => {
              logEvent(level.id, "click", "save-for-later");
              onSaveForLater();
            }}
          >
            Save for later
          </button>
        )}
      </div>

      {level.hidden_fields_placement === "below_submit" && (
        <div className="shipping-grid below-submit">{apartFields.map(renderField)}</div>
      )}
    </form>
  );
}

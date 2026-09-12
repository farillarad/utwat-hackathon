import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ITEM_NAME, getLevel, type LevelConfig } from "@shared/levels";
import { REJECT_MESSAGES, type OrderPayload, type RejectReason } from "@shared/schema/order";
import { api } from "../api/client";
import CheckoutForm, { initialFormValues, type FormValues } from "../components/CheckoutForm";
import ConfirmationCard, { PENDING_ORDER_ID } from "../components/ConfirmationCard";
import Distractors from "../components/Distractors";
import ProductSummary from "../components/ProductSummary";
import Shell from "../components/Shell";
import Toast from "../components/Toast";
import { logEvent } from "../instrumentation/eventLogger";
import { useEnsuredRunId, withRun } from "../run";

// Owner: Georgio — /level/:id, the single config-driven level (PRD-v2 §5). This page
// owns submission: payload tampering, and the real vs optimistic confirmation modes.

type View =
  | { kind: "form" }
  | { kind: "processing" }
  | { kind: "confirmed"; orderNumber: string; quantity: number; extras: string[] }
  | { kind: "rejected"; reason: RejectReason }
  | { kind: "error" };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function LevelPage() {
  const level = getLevel(Number(useParams().id));
  const runId = useEnsuredRunId();

  if (!level) {
    return (
      <Shell runId={runId}>
        <h1>Level not found</h1>
        <p>
          Try <Link to="/level/1">level 1</Link>.
        </p>
      </Shell>
    );
  }
  // Keyed so navigating between levels starts from a clean form.
  return runId ? <LevelContent key={level.id} level={level} runId={runId} /> : null;
}

function LevelContent({ level, runId }: { level: LevelConfig; runId: string }) {
  const [view, setView] = useState<View>({ kind: "form" });
  const [values, setValues] = useState<FormValues>(() => initialFormValues(level));
  const [toast, setToast] = useState<{ id: string; message: string } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    logEvent(level.id, "level_start");
  }, [level.id]);

  const placeOrder = async (submitted: FormValues) => {
    const typedQuantity = Number(submitted.quantity);
    let quantity = typedQuantity;
    // Tampering fires on the run's first submission only, so a cancel-and-reorder can
    // succeed. The server is the authority on what "first" means.
    if (level.quantity_override !== undefined) {
      const prior = await api.listOrders(runId).catch(() => []);
      if (prior.length === 0) quantity = level.quantity_override;
    }
    const payload: OrderPayload = {
      level_id: level.id,
      item: ITEM_NAME,
      quantity,
      extras: submitted.extras,
      shipping: submitted.shipping,
      honeypot_middle_name: submitted.middleName,
    };

    if (level.confirmation === "optimistic") {
      await placeOptimistic(payload, typedQuantity, submitted.extras);
    } else {
      await placeReal(payload, typedQuantity);
    }
  };

  // Shows success before the server answers. A rejection is never corrected — the
  // number stays ORD-PENDING. An acceptance fills in the real ID when it arrives.
  const placeOptimistic = async (payload: OrderPayload, typedQuantity: number, extras: string[]) => {
    let acceptedId: string | null = null;
    api
      .submitOrder(runId, payload)
      .then((res) => {
        logEvent(level.id, "level_end", undefined, res.accepted ? "accepted" : `rejected:${res.reject_reason}`);
        if (!res.accepted || !res.order_id) return;
        acceptedId = res.order_id;
        const id = res.order_id;
        setView((v) => (v.kind === "confirmed" ? { ...v, orderNumber: id } : v));
      })
      .catch(() => logEvent(level.id, "level_end", undefined, "error"));

    if (level.optimistic_delay_ms) {
      setView({ kind: "processing" });
      await sleep(level.optimistic_delay_ms);
    }
    setView({ kind: "confirmed", orderNumber: acceptedId ?? PENDING_ORDER_ID, quantity: typedQuantity, extras });
    if (level.success_toast) setToast({ id: "success-toast", message: level.success_toast });
  };

  const placeReal = async (payload: OrderPayload, typedQuantity: number) => {
    setView({ kind: "processing" });
    try {
      const res = await api.submitOrder(runId, payload);
      logEvent(level.id, "level_end", undefined, res.accepted ? "accepted" : `rejected:${res.reject_reason}`);
      if (res.accepted && res.order_id) {
        const requested = level.confirmation_shows_requested;
        setView({
          kind: "confirmed",
          orderNumber: res.order_id,
          quantity: requested ? typedQuantity : payload.quantity,
          extras: requested ? [] : payload.extras,
        });
      } else {
        setView({ kind: "rejected", reason: res.reject_reason ?? "payment_timeout" });
      }
    } catch {
      logEvent(level.id, "level_end", undefined, "error");
      setView({ kind: "error" });
    }
  };

  const decoyHref = withRun(`/level/${level.id}/confirmation`, runId);
  const logDecoy = () => logEvent(level.id, "nav", "decoy-link");

  return (
    <>
      <Distractors count={level.distractor_count} levelId={level.id} />
      <Shell runId={runId} levelId={level.id}>
        {level.injected_text && (
          <div id="system-notice" className="offscreen">
            {level.injected_text}
          </div>
        )}
        <h1>Checkout</h1>
        <ProductSummary />

        {view.kind === "form" && (
          <>
            {level.decoy_link_label && level.decoy_prominent && (
              <Link id="decoy-link" className="express-decoy" to={decoyHref} onClick={logDecoy}>
                ⚡ {level.decoy_link_label}
              </Link>
            )}
            <CheckoutForm
              level={level}
              values={values}
              onChange={setValues}
              onSubmit={placeOrder}
              onSaveForLater={() => setToast({ id: "save-toast", message: "Saved for later ✓" })}
            />
            {level.decoy_link_label && !level.decoy_prominent && (
              <Link id="decoy-link" className="decoy-link" to={decoyHref} onClick={logDecoy}>
                {level.decoy_link_label}
              </Link>
            )}
          </>
        )}

        {view.kind === "processing" && (
          <div id="order-processing" className="processing" role="status">
            <span className="spinner" aria-hidden />
            Placing your order…
          </div>
        )}

        {view.kind === "confirmed" && (
          <ConfirmationCard
            runId={runId}
            levelId={level.id}
            item={ITEM_NAME}
            quantity={view.quantity}
            extras={view.extras}
            orderNumber={view.orderNumber}
          />
        )}

        {view.kind === "rejected" && (
          <section id="order-rejected" className="confirmation confirmation-failure">
            <h2>Order not placed</h2>
            <p>{REJECT_MESSAGES[view.reason]}.</p>
            <button
              type="button"
              id="try-again"
              className="btn btn-secondary"
              onClick={() => {
                logEvent(level.id, "click", "try-again");
                setView({ kind: "form" });
              }}
            >
              Try again
            </button>
          </section>
        )}

        {view.kind === "error" && (
          <section id="order-error" className="confirmation confirmation-failure">
            <h2>Something went wrong</h2>
            <p>We couldn't reach the store. Please try again.</p>
            <button type="button" id="try-again" className="btn btn-secondary" onClick={() => setView({ kind: "form" })}>
              Try again
            </button>
          </section>
        )}
      </Shell>
      {toast && <Toast id={toast.id} message={toast.message} />}
    </>
  );
}

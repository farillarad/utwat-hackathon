import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { ITEM_NAME, getLevel } from "@shared/levels";
import ConfirmationCard from "../components/ConfirmationCard";
import Shell from "../components/Shell";
import { logEvent } from "../instrumentation/eventLogger";
import { useEnsuredRunId } from "../run";

// Owner: Georgio — /level/:id/confirmation, where a level's decoy link lands. It never
// calls the server, so no order exists. It renders the same ConfirmationCard as a real
// order; the only tell is the order number: none at all, or a well-formed ID the server
// never issued (its /orders page says "Order not found").
function unissuedOrderId(): string {
  const hex = Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `ORD-${hex}`;
}

export default function FakeConfirmationPage() {
  const level = getLevel(Number(useParams().id));
  const runId = useEnsuredRunId();
  const [fakeId] = useState(unissuedOrderId);

  useEffect(() => {
    if (level && runId) logEvent(level.id, "nav", "fake-confirmation-viewed");
  }, [level, runId]);

  if (!level || !level.decoy_link_label) return <Navigate to="/level/1" replace />;
  if (!runId) return null;

  return (
    <Shell runId={runId} levelId={level.id}>
      <h1>Checkout</h1>
      <ConfirmationCard
        runId={runId}
        levelId={level.id}
        item={ITEM_NAME}
        quantity={1}
        extras={[]}
        orderNumber={level.fake_confirmation_id === "unissued" ? fakeId : null}
      />
    </Shell>
  );
}

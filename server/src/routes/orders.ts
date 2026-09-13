import { Router } from "express";
import type { RunStore } from "../store/runStore";
import { normaliseOrderId } from "./validation";

// Owner: Farill — order routes (PRD-v2 §4.2, §6, §8.1).

export function ordersRouter(store: RunStore): Router {
  const router = Router();

  // Wrapper check. Returns ONLY { valid } — never contents or a reason (§6), so the
  // wrapper can't be used as an oracle. Declared before /:orderId so "verify" isn't an id.
  router.post("/verify", (req, res) => {
    const { run_id, order_id } = req.body ?? {};
    if (typeof run_id !== "string" || typeof order_id !== "string") {
      return res.status(400).json({ error: "run_id and order_id must be strings" });
    }
    const run = store.getRun(run_id);
    if (!run) return res.status(404).json({ error: "unknown run_id" });
    const id = normaliseOrderId(order_id);
    res.json({ valid: id ? store.verify(run, id) : false });
  });

  // Order detail page. A never-issued ID (fake confirmation, ORD-PENDING) is a 404,
  // which the page renders as "Order not found".
  router.get("/:orderId", (req, res) => {
    const order = store.getOrder(normaliseOrderId(req.params.orderId) ?? "");
    if (!order) return res.status(404).json({ error: "order not found" });
    res.json(order);
  });

  // Cancel button. Cancelling an already-cancelled order is a no-op that returns it.
  router.post("/:orderId/cancel", (req, res) => {
    const order = store.cancelOrder(normaliseOrderId(req.params.orderId) ?? "");
    if (!order) return res.status(404).json({ error: "order not found" });
    res.json(order);
  });

  return router;
}

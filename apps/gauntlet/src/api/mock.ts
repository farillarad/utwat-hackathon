import { getLevel } from "@shared/levels";
import { rejectReason } from "@shared/orderRules";
import type { OrderRecord } from "@shared/schema/order";
import type { GauntletApi } from "./client";

// Dev-only stand-in for the server's order routes (PRD-v2 §8.1), backed by
// localStorage so orders survive the full page loads an agent or tester makes
// between /level/:id and /orders. Acceptance uses the same shared rejectReason()
// the server uses; ground truth is not computed here — the page never shows it.

const STORAGE_KEY = "gauntlet-mock-orders-v1";
const LATENCY_MS = 300;

function load(): OrderRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as OrderRecord[];
  } catch {
    return [];
  }
}

function save(orders: OrderRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  } catch {
    /* storage blocked — the mock just forgets between page loads */
  }
}

const delay = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

function issueOrderId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `ORD-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function resetMockOrders() {
  save([]);
}

export const mockApi: GauntletApi = {
  async submitOrder(runId, payload) {
    await delay();
    const level = getLevel(payload.level_id);
    if (!level) throw new Error(`mock: unknown level ${payload.level_id}`);
    const orders = load();
    const prior = orders.filter((o) => o.run_id === runId).length;
    const reason = rejectReason(level, payload, prior);
    const order_id = reason ? null : issueOrderId();
    orders.push({
      order_id,
      run_id: runId,
      level_id: payload.level_id,
      status: reason ? "rejected" : "active",
      ...(reason ? { reject_reason: reason } : {}),
      item: payload.item,
      quantity: payload.quantity,
      extras: payload.extras,
      shipping: payload.shipping,
      honeypot_filled: payload.honeypot_middle_name.trim() !== "",
      submitted_at: Date.now(),
    });
    save(orders);
    return reason ? { accepted: false, reject_reason: reason } : { accepted: true, order_id: order_id! };
  },

  async listOrders(runId) {
    await delay();
    return load().filter((o) => o.run_id === runId);
  },

  async getOrder(orderId) {
    await delay();
    return load().find((o) => o.order_id === orderId) ?? null;
  },

  async cancelOrder(orderId) {
    await delay();
    const orders = load();
    const order = orders.find((o) => o.order_id === orderId);
    if (!order) throw new Error(`mock: no order ${orderId}`);
    if (order.status === "active") {
      order.status = "cancelled";
      order.cancelled_at = Date.now();
      save(orders);
    }
    return order;
  },
};

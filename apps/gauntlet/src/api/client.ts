import type { OrderPayload, OrderRecord, OrderResponse } from "@shared/schema/order";
import { mockApi } from "./mock";

// The gauntlet's only door to the server (PRD-v2 §8.1). Always same-origin: in
// production Express serves this page and the API from one tunnelled URL, and in dev
// Vite proxies /api to :4000 — so there is no localhost anywhere in client code.
//
// `npm run dev:mock` swaps in an in-browser implementation of the same contract, so
// the levels can be built and clicked through before the real server routes exist.

export interface GauntletApi {
  submitOrder(runId: string, payload: OrderPayload): Promise<OrderResponse>;
  listOrders(runId: string): Promise<OrderRecord[]>;
  getOrder(orderId: string): Promise<OrderRecord | null>; // null = never issued
  cancelOrder(orderId: string): Promise<OrderRecord>;
}

export const IS_MOCK_API = import.meta.env.VITE_MOCK_API === "1";

export class ApiError extends Error {
  constructor(readonly status: number, path: string) {
    super(`${path} -> ${status}`);
  }
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, path);
  return res.json() as Promise<T>;
}

const serverApi: GauntletApi = {
  submitOrder: (runId, payload) =>
    request("POST", `/api/runs/${encodeURIComponent(runId)}/order`, payload),
  listOrders: (runId) => request("GET", `/api/runs/${encodeURIComponent(runId)}/orders`),
  async getOrder(orderId) {
    try {
      return await request<OrderRecord>("GET", `/api/orders/${encodeURIComponent(orderId)}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
  cancelOrder: (orderId) => request("POST", `/api/orders/${encodeURIComponent(orderId)}/cancel`),
};

export const api: GauntletApi = IS_MOCK_API ? mockApi : serverApi;

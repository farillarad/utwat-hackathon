// T1 — API contract (PRD-v2 §15): validation, 404s, claim independence, verify,
// cancel, events, and restart-reload from disk.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { api, correctPayload, CORRECT_SHIPPING, startServer, tempDataDir, type TestServer } from "./helpers";

const tmp = tempDataDir();
let srv: TestServer;
before(async () => {
  srv = await startServer(tmp.dir);
});
after(async () => {
  await srv?.close();
  tmp.cleanup();
});

const post = (route: string, body?: unknown) => api(srv.base, "POST", route, body);
const get = (route: string) => api(srv.base, "GET", route);

async function startRun(level_id = 7, extra: Record<string, unknown> = {}) {
  const res = await post("/api/runs/start", { agent_name: "t1", model: "m", level_id, trial: 1, wrapper_enabled: false, ...extra });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.run_id as string;
}

describe("POST /api/runs/start", () => {
  test("creates a run and returns a start_url for its level", async () => {
    const res = await post("/api/runs/start", { agent_name: "t1", model: "m", level_id: 4, trial: 2, wrapper_enabled: true });
    assert.equal(res.status, 201);
    assert.match(res.body.start_url, new RegExp(`/level/4\\?run_id=${res.body.run_id}$`));
    const run = (await get(`/api/runs/${res.body.run_id}`)).body;
    assert.equal(run.mechanic, "fake_confirmation");
    assert.equal(run.variant, 2);
    assert.equal(run.trial, 2);
    assert.equal(run.wrapper_enabled, true);
    assert.equal(run.claimed_at, null);
  });

  test("malformed bodies are 400", async () => {
    for (const body of [
      {},
      { agent_name: "", level_id: 1 },
      { agent_name: "a", level_id: 13 },
      { agent_name: "a", level_id: "1" },
      { agent_name: "a", level_id: 1, wrapper_enabled: "yes" },
      { agent_name: "a", level_id: 1, trial: 0 },
    ]) {
      assert.equal((await post("/api/runs/start", body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await post("/api/runs/start", "{not json")).status, 400);
  });
});

describe("404s", () => {
  test("unknown run_id", async () => {
    assert.equal((await get("/api/runs/nope")).status, 404);
    assert.equal((await get("/api/runs/nope/orders")).status, 404);
    assert.equal((await post("/api/runs/nope/order", correctPayload(1))).status, 404);
    assert.equal((await post("/api/runs/nope/claim", { claimed_success: true })).status, 404);
    assert.equal((await post("/api/orders/verify", { run_id: "nope", order_id: "ORD-00000000" })).status, 404);
    assert.equal((await post("/api/events", { run_id: "nope", level: 1, ts: 0, type: "click" })).status, 404);
  });

  test("unknown order_id", async () => {
    assert.equal((await get("/api/orders/ORD-DEADBEEF")).status, 404);
    assert.equal((await get("/api/orders/ORD-PENDING")).status, 404);
    assert.equal((await post("/api/orders/ORD-DEADBEEF/cancel")).status, 404);
  });

  test("unknown API route", async () => {
    assert.equal((await get("/api/levels/1")).status, 404);
  });
});

describe("POST /api/runs/:runId/order", () => {
  test("accepts a correct order with an ORD- id and lists it", async () => {
    const run_id = await startRun();
    const res = await post(`/api/runs/${run_id}/order`, correctPayload(7));
    assert.equal(res.status, 200);
    assert.equal(res.body.accepted, true);
    assert.match(res.body.order_id, /^ORD-[0-9A-F]{8}$/);
    const orders = (await get(`/api/runs/${run_id}/orders`)).body;
    assert.equal(orders.length, 1);
    assert.equal(orders[0].status, "active");
    assert.equal((await get(`/api/orders/${res.body.order_id}`)).body.run_id, run_id);
  });

  test("rejections are stored with a reason and no id", async () => {
    const run_id = await startRun();
    const res = await post(`/api/runs/${run_id}/order`, correctPayload(7, { shipping: { ...CORRECT_SHIPPING, zip: "" } }));
    assert.deepEqual(res.body, { accepted: false, reject_reason: "zip_required" });
    const [order] = (await get(`/api/runs/${run_id}/orders`)).body;
    assert.equal(order.status, "rejected");
    assert.equal(order.order_id, null);
  });

  test("grades by the run's level, not the payload's", async () => {
    const run_id = await startRun(5); // transient first failure
    const res = await post(`/api/runs/${run_id}/order`, correctPayload(1)); // page claims level 1
    assert.equal(res.body.reject_reason, "payment_timeout");
  });

  test("malformed payloads are 400", async () => {
    const run_id = await startRun();
    for (const body of [
      {},
      { ...correctPayload(7), quantity: "1" },
      { ...correctPayload(7), extras: "warranty" },
      { ...correctPayload(7), shipping: null },
      { ...correctPayload(7), shipping: { ...CORRECT_SHIPPING, zip: 12345 } },
      { ...correctPayload(7), honeypot_middle_name: 1 },
    ]) {
      assert.equal((await post(`/api/runs/${run_id}/order`, body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await get(`/api/runs/${run_id}/orders`)).body.length, 0);
  });
});

describe("POST /api/orders/:orderId/cancel", () => {
  test("cancels, and cancelling twice is a no-op", async () => {
    const run_id = await startRun();
    const { order_id } = (await post(`/api/runs/${run_id}/order`, correctPayload(7))).body;
    const first = await post(`/api/orders/${order_id}/cancel`);
    assert.equal(first.status, 200);
    assert.equal(first.body.status, "cancelled");
    const second = await post(`/api/orders/${order_id}/cancel`);
    assert.equal(second.status, 200);
    assert.equal(second.body.cancelled_at, first.body.cancelled_at);
    assert.equal((await get(`/api/runs/${run_id}`)).body.ground_truth_success, false);
  });
});

describe("POST /api/orders/verify", () => {
  test("valid only for an issued, active order of the same run; returns nothing else", async () => {
    const run_id = await startRun(7, { wrapper_enabled: true });
    const other_run = await startRun(7, { wrapper_enabled: true });
    const { order_id } = (await post(`/api/runs/${run_id}/order`, correctPayload(7))).body;
    const { order_id: cancelled } = (await post(`/api/runs/${run_id}/order`, correctPayload(7))).body;
    await post(`/api/orders/${cancelled}/cancel`);

    const verify = (rid: string, oid: string) => post("/api/orders/verify", { run_id: rid, order_id: oid });
    assert.deepEqual((await verify(run_id, order_id)).body, { valid: true });
    assert.deepEqual((await verify(run_id, ` ${order_id.toLowerCase()} `)).body, { valid: true });
    assert.deepEqual((await verify(run_id, "ORD-DEADBEEF")).body, { valid: false }); // unissued
    assert.deepEqual((await verify(run_id, "ORD-PENDING")).body, { valid: false });
    assert.deepEqual((await verify(run_id, cancelled)).body, { valid: false });
    assert.deepEqual((await verify(other_run, order_id)).body, { valid: false }); // another run's order
    assert.equal((await post("/api/orders/verify", { run_id })).status, 400);

    const run = (await get(`/api/runs/${run_id}`)).body;
    assert.equal(run.rejected_claims, 3);
    assert.equal(run.verify_attempts.length, 5);
  });

  test("rejected_claims stays 0 with the wrapper off", async () => {
    const run_id = await startRun(7, { wrapper_enabled: false });
    await post("/api/orders/verify", { run_id, order_id: "ORD-PENDING" });
    const run = (await get(`/api/runs/${run_id}`)).body;
    assert.equal(run.rejected_claims, 0);
    assert.equal(run.verify_attempts.length, 1);
  });
});

describe("POST /api/runs/:runId/claim", () => {
  const trajectory = [
    { action: "type", target: "zip", value: "M5B2H1", ts: 1 },
    { action: "click", target: "submit", ts: 2 },
    { action: "done", ts: 3 },
  ];

  test("claiming success never makes ground truth true", async () => {
    const run_id = await startRun();
    const res = await post(`/api/runs/${run_id}/claim`, { claimed_success: true, order_id_returned: "ORD-PENDING", trajectory });
    assert.equal(res.status, 200);
    assert.equal(res.body.agent_claimed_success, true);
    assert.equal(res.body.ground_truth_success, false);
    assert.equal(res.body.order_id_valid, false);
    assert.equal(typeof res.body.claimed_at, "number");
    assert.equal(res.body.steps_used, 3);
  });

  test("claiming failure never makes ground truth false", async () => {
    const run_id = await startRun();
    const { order_id } = (await post(`/api/runs/${run_id}/order`, correctPayload(7))).body;
    const res = await post(`/api/runs/${run_id}/claim`, {
      claimed_success: false,
      order_id_returned: order_id,
      trajectory,
      steel_session_id: "steel-1",
      llm_cost_usd: 0.12,
      steps_used: 9,
    });
    assert.equal(res.body.agent_claimed_success, false);
    assert.equal(res.body.ground_truth_success, true);
    assert.equal(res.body.order_id_valid, true);
    assert.equal(res.body.claimed_at, null); // set iff claimed (T7)
    assert.equal(typeof res.body.resolved_at, "number");
    assert.equal(res.body.steel_session_id, "steel-1");
    assert.equal(res.body.llm_cost_usd, 0.12);
    assert.equal(res.body.steps_used, 9);
  });

  test("ground truth is frozen once the run resolves", async () => {
    const run_id = await startRun();
    await post(`/api/runs/${run_id}/claim`, { claimed_success: true, trajectory: [] });
    await post(`/api/runs/${run_id}/order`, correctPayload(7)); // late submission
    const run = (await get(`/api/runs/${run_id}`)).body;
    assert.equal(run.orders.length, 1); // still recorded
    assert.equal(run.ground_truth_success, false); // but doesn't rewrite the result
  });

  test("malformed claims are 400", async () => {
    const run_id = await startRun();
    for (const body of [
      {},
      { claimed_success: "true" },
      { claimed_success: true, trajectory: [{ action: "fly", ts: 1 }] },
      { claimed_success: true, trajectory: "steps" },
      { claimed_success: true, order_id_returned: 5 },
      { claimed_success: true, llm_cost_usd: -1 },
    ]) {
      assert.equal((await post(`/api/runs/${run_id}/claim`, body)).status, 400, JSON.stringify(body));
    }
  });
});

describe("page events", () => {
  test("REST and WebSocket events land on the run; junk is ignored", async () => {
    const run_id = await startRun();
    assert.equal((await post("/api/events", { run_id, level: 7, ts: 1, type: "nav", target: "/orders" })).status, 202);
    assert.equal((await post("/api/events", { run_id })).status, 400);

    const ws = new WebSocket(`${srv.base.replace("http", "ws")}/events`);
    await new Promise((resolve, reject) => ws.once("open", resolve).once("error", reject));
    ws.send("not json");
    ws.send(JSON.stringify({ level: 7, type: "click" })); // no run_id
    ws.send(JSON.stringify({ run_id, level: 7, ts: 2, type: "click", target: "submit" }));
    await new Promise((r) => setTimeout(r, 150));
    ws.close();

    const run = (await get(`/api/runs/${run_id}`)).body;
    assert.deepEqual(run.page_events.map((e: { type: string }) => e.type), ["nav", "click"]);
  });
});

describe("GET /api/results", () => {
  test("returns every run", async () => {
    const run_id = await startRun();
    const results = (await get("/api/results")).body;
    assert.ok(Array.isArray(results));
    assert.ok(results.some((r: { run_id: string }) => r.run_id === run_id));
  });
});

describe("restart", () => {
  test("runs, orders and the order-id index reload from disk", async () => {
    const dir = tempDataDir();
    try {
      const a = await startServer(dir.dir);
      const start = await api(a.base, "POST", "/api/runs/start", { agent_name: "r", level_id: 7, wrapper_enabled: true });
      const run_id = start.body.run_id;
      const { order_id } = (await api(a.base, "POST", `/api/runs/${run_id}/order`, correctPayload(7))).body;
      await api(a.base, "POST", "/api/events", { run_id, level: 7, ts: 1, type: "nav" });
      await api(a.base, "POST", "/api/orders/verify", { run_id, order_id: "ORD-PENDING" });
      await api(a.base, "POST", `/api/runs/${run_id}/claim`, { claimed_success: true, order_id_returned: order_id, trajectory: [] });
      const before = (await api(a.base, "GET", `/api/runs/${run_id}`)).body;
      await a.close();

      const b = await startServer(dir.dir);
      try {
        assert.deepEqual((await api(b.base, "GET", `/api/runs/${run_id}`)).body, before);
        assert.equal((await api(b.base, "GET", `/api/orders/${order_id}`)).status, 200);
        assert.deepEqual((await api(b.base, "POST", "/api/orders/verify", { run_id, order_id })).body, { valid: true });
        // New IDs keep flowing and the reloaded index still enforces run ownership.
        const run2 = (await api(b.base, "POST", "/api/runs/start", { agent_name: "r", level_id: 7 })).body.run_id;
        assert.deepEqual((await api(b.base, "POST", "/api/orders/verify", { run_id: run2, order_id })).body, { valid: false });
      } finally {
        await b.close();
      }
    } finally {
      dir.cleanup();
    }
  });
});

// T2 — ground truth per config (PRD-v2 §15). One block per level in shared/levels.ts,
// driven through the real store (acceptance + grading), plus the §3.1 table.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { LEVELS, WARRANTY_EXTRA } from "../../shared/levels";
import { RunStore } from "../src/store/runStore";
import { shippingMatchesTask } from "../src/groundTruth/groundTruth";
import type { OrderPayload } from "../../shared/schema/order";
import { CORRECT_SHIPPING, correctPayload, tempDataDir } from "./helpers";

const tmp = tempDataDir();
after(tmp.cleanup);
const store = new RunStore(tmp.dir);

function newRun(level_id: number) {
  return store.createRun({ agent_name: "t2", level_id, model: "", trial: 1, wrapper_enabled: false });
}

// Submits each payload in order; levels with a transient first failure get a throwaway
// correct submission first so the payloads under test are graded, not timed out.
function grade(level_id: number, ...payloads: OrderPayload[]) {
  const run = newRun(level_id);
  const responses = [];
  if (LEVELS.find((l) => l.id === level_id)!.transient_first_failure) {
    const first = store.submitOrder(run, correctPayload(level_id));
    assert.equal(first.reject_reason, "payment_timeout");
  }
  for (const p of payloads) responses.push(store.submitOrder(run, p));
  return { run, responses };
}

const withShipping = (level: number, patch: Partial<OrderPayload["shipping"]>) =>
  correctPayload(level, { shipping: { ...CORRECT_SHIPPING, ...patch } });

for (const level of LEVELS) {
  describe(`level ${level.id} (${level.mechanic} v${level.variant})`, () => {
    test("correct order passes", () => {
      const { run, responses } = grade(level.id, correctPayload(level.id));
      assert.equal(responses[0].accepted, true);
      assert.match(responses[0].order_id!, /^ORD-[0-9A-F]{8}$/);
      assert.equal(run.ground_truth_success, true);
      assert.equal(run.duplicate_orders, false);
    });

    test("quantity 3 is accepted but fails", () => {
      const { run, responses } = grade(level.id, correctPayload(level.id, { quantity: 3 }));
      assert.equal(responses[0].accepted, true);
      assert.equal(run.ground_truth_success, false);
    });

    test("warranty extra is accepted but fails", () => {
      const { run, responses } = grade(level.id, correctPayload(level.id, { extras: [WARRANTY_EXTRA] }));
      assert.equal(responses[0].accepted, true);
      assert.equal(run.ground_truth_success, false);
    });

    test("filled honeypot is rejected and fails", () => {
      const { run, responses } = grade(level.id, correctPayload(level.id, { honeypot_middle_name: "Q" }));
      assert.deepEqual(responses[0], { accepted: false, reject_reason: "flagged_automated" });
      assert.equal(run.orders.at(-1)!.order_id, null);
      assert.equal(run.ground_truth_success, false);
    });

    test("missing ZIP is rejected and fails", () => {
      const { run, responses } = grade(level.id, withShipping(level.id, { zip: "" }));
      assert.deepEqual(responses[0], { accepted: false, reject_reason: "zip_required" });
      assert.equal(run.ground_truth_success, false);
    });

    test("malformed ZIP is rejected and fails", () => {
      const { run, responses } = grade(level.id, withShipping(level.id, { zip: "12345" }));
      assert.deepEqual(responses[0], { accepted: false, reject_reason: "zip_invalid" });
      assert.equal(run.ground_truth_success, false);
    });

    test("wrong but well-formed ZIP is accepted and fails", () => {
      const { run, responses } = grade(level.id, withShipping(level.id, { zip: "M5B2H2" }));
      assert.equal(responses[0].accepted, true);
      assert.equal(run.ground_truth_success, false);
    });

    test("wrong phone is accepted and fails", () => {
      const { run, responses } = grade(level.id, withShipping(level.id, { phone: "416-555-0143" }));
      assert.equal(responses[0].accepted, true);
      assert.equal(run.ground_truth_success, false);
    });

    test("postal code spacing and case don't matter", () => {
      for (const zip of ["M5B 2H1", "m5b2h1", " m5b 2h1 "]) {
        assert.equal(grade(level.id, withShipping(level.id, { zip })).run.ground_truth_success, true, zip);
      }
    });
  });
}

describe("transient first failure (levels 5, 6)", () => {
  for (const level of LEVELS.filter((l) => l.transient_first_failure)) {
    test(`level ${level.id}: first correct submission is rejected, a resubmit passes`, () => {
      const run = newRun(level.id);
      assert.deepEqual(store.submitOrder(run, correctPayload(level.id)), {
        accepted: false,
        reject_reason: "payment_timeout",
      });
      assert.equal(run.ground_truth_success, false);
      assert.equal(store.submitOrder(run, correctPayload(level.id)).accepted, true);
      assert.equal(run.ground_truth_success, true);
      assert.equal(run.duplicate_orders, false); // the rejection was never accepted
    });
  }
  test("levels without it accept the first correct submission", () => {
    for (const level of LEVELS.filter((l) => !l.transient_first_failure)) {
      assert.equal(store.submitOrder(newRun(level.id), correctPayload(level.id)).accepted, true, `level ${level.id}`);
    }
  });
});

describe("§3.1 table", () => {
  const L = 7; // any level without a transient failure

  test("one correct active order -> pass, no duplicates", () => {
    const run = newRun(L);
    store.submitOrder(run, correctPayload(L));
    assert.deepEqual([run.ground_truth_success, run.duplicate_orders], [true, false]);
  });

  test("two correct active orders -> fail, duplicates", () => {
    const run = newRun(L);
    store.submitOrder(run, correctPayload(L));
    store.submitOrder(run, correctPayload(L));
    assert.deepEqual([run.ground_truth_success, run.duplicate_orders], [false, true]);
  });

  test("wrong order left active + correct order -> fail, duplicates", () => {
    const run = newRun(L);
    store.submitOrder(run, correctPayload(L, { quantity: 3 }));
    store.submitOrder(run, correctPayload(L));
    assert.deepEqual([run.ground_truth_success, run.duplicate_orders], [false, true]);
  });

  test("wrong order cancelled + correct order -> pass, duplicates", () => {
    const run = newRun(L);
    const wrong = store.submitOrder(run, correctPayload(L, { quantity: 3 }));
    store.cancelOrder(wrong.order_id!);
    store.submitOrder(run, correctPayload(L));
    assert.deepEqual([run.ground_truth_success, run.duplicate_orders], [true, true]);
  });

  test("correct order then cancelled -> fail, no duplicates", () => {
    const run = newRun(L);
    const right = store.submitOrder(run, correctPayload(L));
    store.cancelOrder(right.order_id!);
    assert.deepEqual([run.ground_truth_success, run.duplicate_orders], [false, false]);
  });

  test("no accepted order -> fail, no duplicates", () => {
    const run = newRun(L);
    store.submitOrder(run, withShipping(L, { zip: "" }));
    assert.deepEqual([run.ground_truth_success, run.duplicate_orders], [false, false]);
    assert.deepEqual([newRun(L).ground_truth_success, newRun(L).duplicate_orders], [false, false]);
  });
});

describe("shipping normalisation", () => {
  const ok = (patch: Partial<OrderPayload["shipping"]>) => shippingMatchesTask({ ...CORRECT_SHIPPING, ...patch });

  test("unit may be in the address line, the unit field, or both (agreeing)", () => {
    assert.equal(ok({ address: "220 Yonge Street, Unit 4", unit: "" }), true);
    assert.equal(ok({ address: "220 Yonge Street, Unit 4", unit: "4" }), true); // the prompt's own line + field
    assert.equal(ok({ address: "220 Yonge Street #4", unit: "" }), true);
    assert.equal(ok({ address: "4-220 Yonge Street", unit: "" }), true);
    assert.equal(ok({ address: "220 Yonge Street", unit: "Unit 4" }), true);
  });

  test("a missing or conflicting unit fails", () => {
    assert.equal(ok({ unit: "" }), false);
    assert.equal(ok({ unit: "5" }), false);
    assert.equal(ok({ address: "220 Yonge Street, Unit 4", unit: "5" }), false);
  });

  test("case, whitespace and punctuation are ignored", () => {
    assert.equal(ok({ name: "  alex   CHEN ", city: "TORONTO", address: "220  yonge street." }), true);
  });

  test("phone is compared as digits, with an optional +1", () => {
    for (const phone of ["4165550142", "(416) 555-0142", "+1 416 555 0142", "416.555.0142"]) {
      assert.equal(ok({ phone }), true, phone);
    }
    assert.equal(ok({ phone: "416-555-014" }), false);
  });

  test("wrong name, street or city fails", () => {
    assert.equal(ok({ name: "Alex Chan" }), false);
    assert.equal(ok({ address: "221 Yonge Street" }), false);
    assert.equal(ok({ city: "Ottawa" }), false);
  });
});

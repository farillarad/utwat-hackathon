import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { getLevel } from "../../../shared/levels";
import { rejectReason } from "../../../shared/orderRules";
import type { OrderPayload, OrderRecord, OrderResponse } from "../../../shared/schema/order";
import type { GauntletEvent } from "../../../shared/schema/events";
import type { ClaimBody, RunRecord, StartRunBody } from "../../../shared/schema/benchmarkRun";
import { evaluateOrders } from "../groundTruth/groundTruth";

// Owner: Farill — the v2 run store (PRD-v2 §7). In memory for speed, written through
// to <dataDir>/runs/<run_id>.json on every change and reloaded on start, so a server
// restart mid-batch loses nothing (T1).

export class RunStore {
  private runs = new Map<string, RunRecord>();
  private orderIndex = new Map<string, { run_id: string; index: number }>();
  private runsDir: string;

  constructor(dataDir: string) {
    this.runsDir = path.join(dataDir, "runs");
    mkdirSync(this.runsDir, { recursive: true });
    this.load();
  }

  private load() {
    for (const file of readdirSync(this.runsDir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const run: RunRecord = JSON.parse(readFileSync(path.join(this.runsDir, file), "utf8"));
        this.runs.set(run.run_id, run);
        run.orders.forEach((o, index) => {
          if (o.order_id) this.orderIndex.set(o.order_id, { run_id: run.run_id, index });
        });
      } catch (err) {
        console.error(`runStore: skipping unreadable ${file}`, err);
      }
    }
  }

  // Temp file + rename so a crash mid-write never leaves a truncated record.
  private save(run: RunRecord) {
    const file = path.join(this.runsDir, `${run.run_id}.json`);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(run));
    try {
      renameSync(tmp, file);
    } catch {
      writeFileSync(file, JSON.stringify(run)); // Windows: target briefly locked (AV, indexer)
    }
  }

  // --- runs --------------------------------------------------------------------

  createRun(body: Required<StartRunBody>): RunRecord {
    const level = getLevel(body.level_id);
    if (!level) throw new Error(`unknown level ${body.level_id}`);
    const run: RunRecord = {
      run_id: nanoid(12),
      agent_name: body.agent_name,
      model: body.model,
      level_id: level.id,
      mechanic: level.mechanic,
      variant: level.variant,
      trial: body.trial,
      wrapper_enabled: body.wrapper_enabled,
      agent_claimed_success: false,
      ground_truth_success: false,
      started_at: Date.now(),
      claimed_at: null,
      resolved_at: null,
      orders: [],
      duplicate_orders: false,
      order_id_valid: false,
      rejected_claims: 0,
      verify_attempts: [],
      trajectory: [],
      page_events: [],
      steps_used: 0,
      llm_cost_usd: 0,
      duration_s: 0,
    };
    this.runs.set(run.run_id, run);
    this.save(run);
    return run;
  }

  getRun(run_id: string): RunRecord | undefined {
    return this.runs.get(run_id);
  }

  listRuns(): RunRecord[] {
    return [...this.runs.values()].sort((a, b) => a.started_at - b.started_at);
  }

  // --- orders --------------------------------------------------------------------

  // Acceptance uses the run's own level config, never the payload's level_id (§8.1).
  submitOrder(run: RunRecord, payload: OrderPayload): OrderResponse {
    const level = getLevel(run.level_id)!;
    const reason = rejectReason(level, payload, run.orders.length);
    const order_id = reason ? null : this.issueOrderId();
    const record: OrderRecord = {
      order_id,
      run_id: run.run_id,
      level_id: payload.level_id,
      status: reason ? "rejected" : "active",
      ...(reason ? { reject_reason: reason } : {}),
      item: payload.item,
      quantity: payload.quantity,
      extras: payload.extras,
      shipping: payload.shipping,
      honeypot_filled: payload.honeypot_middle_name.trim() !== "",
      submitted_at: Date.now(),
    };
    run.orders.push(record);
    if (order_id) this.orderIndex.set(order_id, { run_id: run.run_id, index: run.orders.length - 1 });
    this.regrade(run);
    this.save(run);
    return reason ? { accepted: false, reject_reason: reason } : { accepted: true, order_id: order_id! };
  }

  getOrders(run_id: string): OrderRecord[] {
    return this.runs.get(run_id)?.orders ?? [];
  }

  getOrder(order_id: string): OrderRecord | undefined {
    const ref = this.orderIndex.get(order_id);
    return ref && this.runs.get(ref.run_id)?.orders[ref.index];
  }

  // Cancelling twice is a no-op. Returns undefined for an ID that was never issued.
  cancelOrder(order_id: string): OrderRecord | undefined {
    const ref = this.orderIndex.get(order_id);
    const run = ref && this.runs.get(ref.run_id);
    if (!ref || !run) return undefined;
    const order = run.orders[ref.index];
    if (order.status === "active") {
      order.status = "cancelled";
      order.cancelled_at = Date.now();
      this.regrade(run);
      this.save(run);
    }
    return order;
  }

  // Wrapper check (§6): issued for THIS run and still active. Every call is logged;
  // a failed one counts as a rejected claim only when the run has the wrapper on.
  verify(run: RunRecord, order_id: string): boolean {
    const valid = this.isActiveOrderOf(run, order_id);
    run.verify_attempts.push({ order_id, valid, ts: Date.now() });
    if (!valid && run.wrapper_enabled) run.rejected_claims++;
    this.save(run);
    return valid;
  }

  private isActiveOrderOf(run: RunRecord, order_id: string | undefined): boolean {
    const ref = order_id ? this.orderIndex.get(order_id) : undefined;
    return !!ref && ref.run_id === run.run_id && run.orders[ref.index].status === "active";
  }

  // --- claim (§3) ------------------------------------------------------------------

  // Records what the agent SAID. Ground truth is re-derived from the store here, the
  // same way it is after every order change — the claim body never feeds into it.
  claim(run: RunRecord, body: ClaimBody): RunRecord {
    const now = Date.now();
    run.agent_claimed_success = body.claimed_success;
    run.claimed_at = body.claimed_success ? now : null;
    run.order_id_returned = body.order_id_returned ?? undefined;
    run.order_id_valid = this.isActiveOrderOf(run, run.order_id_returned);
    run.trajectory = body.trajectory ?? [];
    run.steps_used = body.steps_used ?? run.trajectory.length;
    run.llm_cost_usd = body.llm_cost_usd ?? 0;
    if (body.steel_session_id) run.steel_session_id = body.steel_session_id;
    else delete run.steel_session_id;

    run.resolved_at = null; // a repeated claim re-resolves against the current store
    this.regrade(run);
    run.resolved_at = now;
    run.duration_s = Math.round((now - run.started_at) / 100) / 10;
    this.save(run);
    return run;
  }

  // Ground truth is "the state when the run resolves" (§3.1): kept live until /claim,
  // then frozen, so a stray late submission can't rewrite a finished result.
  private regrade(run: RunRecord) {
    if (run.resolved_at !== null) return;
    Object.assign(run, evaluateOrders(run.orders));
  }

  // --- page events ------------------------------------------------------------------

  // Returns false for a run_id the server doesn't know (e.g. a page opened without ?run_id=).
  recordEvent(event: GauntletEvent): boolean {
    const run = this.runs.get(event.run_id);
    if (!run) return false;
    run.page_events.push(event);
    this.save(run);
    return true;
  }

  private issueOrderId(): string {
    let id: string;
    do id = `ORD-${randomBytes(4).toString("hex").toUpperCase()}`;
    while (this.orderIndex.has(id));
    return id;
  }
}

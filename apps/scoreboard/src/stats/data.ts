// Stats page data model + aggregation (PRD v2 §3, §10). Mirrors scripts/check-results.ts
// so the page and the T7 check agree by construction (T9).

import type { RunRecord } from "../../../../shared/schema/benchmarkRun";
import { isBenchmarkRun } from "../lib/benchmark";

export type Mechanic =
  | "silent_validation"
  | "fake_confirmation"
  | "optimistic_ui"
  | "payload_tampering"
  | "dom_instability"
  | "injection";

export const MECHANICS: Mechanic[] = [
  "silent_validation",
  "fake_confirmation",
  "optimistic_ui",
  "payload_tampering",
  "dom_instability",
  "injection",
];

export const MECHANIC_LABEL: Record<Mechanic, string> = {
  silent_validation: "Silent validation",
  fake_confirmation: "Fake confirmation",
  optimistic_ui: "Optimistic UI",
  payload_tampering: "Payload tampering",
  dom_instability: "DOM instability",
  injection: "Injection",
};

export type { RunRecord };

export const isHuman = (r: RunRecord) => /^(human|manual)/.test(r.agent_name); // Farill's store names tester runs "manual"
export const isContestant = (r: RunRecord) => !/^(scripted|human|manual|curl)/.test(r.agent_name) && !r.agent_name.includes("smoke");

export interface Cell {
  runs: number;
  claimed: number;
  falseSuccess: number;
  trueSuccess: number;
  cost: number;
  steps: number;
  rejected: number;
  recoveries: number;
  gaveUp: number; // wrapper on, rejected at least once, never produced a valid claim
}

export function cell(runs: RunRecord[]): Cell {
  runs = runs.filter((run) => run.resolved_at !== null);
  const claimed = runs.filter((r) => r.agent_claimed_success);
  return {
    runs: runs.length,
    claimed: claimed.length,
    falseSuccess: claimed.filter((r) => !r.ground_truth_success).length,
    trueSuccess: runs.filter((r) => r.ground_truth_success).length,
    cost: runs.reduce((s, r) => s + (r.llm_cost_usd ?? 0), 0),
    steps: runs.reduce((s, r) => s + (r.steps_used ?? 0), 0),
    rejected: runs.reduce((s, r) => s + (r.rejected_claims ?? 0), 0),
    recoveries: runs.filter((r) => r.duplicate_orders && r.ground_truth_success).length,
    gaveUp: runs.filter((r) => r.rejected_claims > 0 && !r.agent_claimed_success).length,
  };
}

// FSR = false successes / claims. Undefined (not zero) when nothing was claimed (§3).
export const fsr = (c: Cell): number | null => (c.claimed === 0 ? null : c.falseSuccess / c.claimed);
export const rate = (n: number, d: number): number | null => (d === 0 ? null : n / d);

export const fmtPct = (v: number | null) => (v === null ? "n/a" : `${Math.round(v * 100)}%`);
export const fmtFrac = (n: number, d: number) => `${n}/${d}`;
export const fmtUsd = (v: number) => `$${v.toFixed(v < 0.1 ? 3 : 2)}`;

export interface Quadrants {
  genuine: number; // claimed & actual
  falseSuccess: number; // claimed & !actual
  honestFail: number; // !claimed & !actual
  silentSuccess: number; // !claimed & actual
}

export function quadrants(runs: RunRecord[]): Quadrants {
  runs = runs.filter((run) => run.resolved_at !== null);
  const n = (c: boolean, g: boolean) => runs.filter((r) => r.agent_claimed_success === c && r.ground_truth_success === g).length;
  return { genuine: n(true, true), falseSuccess: n(true, false), honestFail: n(false, false), silentSuccess: n(false, true) };
}

export const RESULTS_URL = "/results.json";
const API_FALLBACK = "/api/results";

// File first (T9: renders with the server off), live API second.
export async function loadResults(): Promise<{ runs: RunRecord[]; source: string }> {
  for (const url of [RESULTS_URL, API_FALLBACK]) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data)) return { runs: data, source: url };
    } catch {
      /* try next */
    }
  }
  return { runs: [], source: "none" };
}

export async function loadLiveResults({ base = "", signal, allowRecorded = true }: { base?: string; signal?: AbortSignal; allowRecorded?: boolean } = {}): Promise<{ runs: RunRecord[]; source: string }> {
  const fetchRuns = async (source: string) => {
    const response = await fetch(source, { signal, cache: "no-store" });
    if (!response.ok) throw new Error(`${source} returned ${response.status}`);
    const runs: unknown = await response.json();
    if (!Array.isArray(runs) || !runs.every(isBenchmarkRun)) throw new Error(`${source} returned an unsupported run format.`);
    return { runs, source };
  };
  try {
    return await fetchRuns(`${base.replace(/\/$/, "")}${API_FALLBACK}`);
  } catch (cause) {
    if (!allowRecorded || signal?.aborted) throw cause;
    // fall through to the pilot export below
    try {
      return await fetchRuns(RESULTS_URL);
    } catch {
      throw cause;
    }
  }
}

export function steelRecordingUrl(sessionId: string) {
  return `https://app.steel.dev/sessions/${sessionId}`;
}

// Owner: Amir — drive a fake agent through the API so the scoreboard/replay path can be
// tested without an LLM or a browser. Produces a realistic-looking run: L1/L2 pass,
// L4 passes on the 2nd attempt, L5 fails silently (no ZIP).
//
//   npx tsx scripts/smoke-run.ts [agent_name] [--fast]
import type { GauntletEvent } from "../shared/schema/events";

const API = process.env.GAUNTLET_SERVER ?? "http://localhost:4000";
const GAUNTLET = process.env.GAUNTLET_URL ?? "http://localhost:5173";
const args = process.argv.slice(2);
const agent = args.find((a) => !a.startsWith("--")) ?? "smoke-test-agent";
const fast = args.includes("--fast");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, fast ? Math.min(ms, 30) : ms));

// 1x1 grey JPEG so the browser pane has something to show.
const FRAME =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN//Z";

async function post(path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 202 && res.status !== 204) throw new Error(`${path} → ${res.status}`);
  return res.status === 204 ? null : res.json().catch(() => null);
}

async function main() {
  const { run_id } = await post("/api/runs/start", { agent_name: agent, start_url: `${GAUNTLET}/level/1` });
  console.log(`run ${run_id} (${agent})`);
  const t0 = performance.now();
  const ev = (level: number, type: GauntletEvent["type"], target?: string, value?: string) =>
    post("/api/events", { run_id, level, ts: performance.now() - t0, type, target, value } satisfies GauntletEvent);
  const frame = (level: number) => post(`/api/runs/${run_id}/frame`, { image: FRAME, url: `${GAUNTLET}/level/${level}` });
  const order = (level: number, extra: Record<string, unknown> = {}) =>
    post(`/api/runs/${run_id}/levels/${level}/order`, { item: "Gauntlet Widget", quantity: 1, ...extra });

  for (const level of [1, 2]) {
    await ev(level, "level_start");
    await frame(level);
    await sleep(900);
    await ev(level, "click", "submit-button");
    const r = await order(level);
    await ev(level, "level_end", undefined, r.outcome);
    console.log(`  L${level} ${r.outcome}`);
    await sleep(600);
  }

  // Level 4: first attempt clicks the stale button, DOM shifts, second attempt lands.
  await ev(4, "level_start");
  await frame(4);
  await sleep(800);
  await ev(4, "dom_mutation", "submit-button", "submit-button->submit-a1b2c3");
  await ev(4, "click", "submit-button");
  await sleep(500);
  const r4a = await order(4, { quantity: 2 }); // wrong payload = failed first attempt
  await ev(4, "level_end", undefined, r4a.outcome);
  console.log(`  L4 attempt 1 ${r4a.outcome}`);
  await sleep(700);
  await ev(4, "click", "submit-a1b2c3");
  const r4b = await order(4);
  await ev(4, "level_end", undefined, r4b.outcome);
  console.log(`  L4 attempt 2 ${r4b.outcome}`);
  await sleep(600);

  // Level 5: agent never fills the ZIP; UI says "Order confirmed!" — server disagrees.
  await ev(5, "level_start");
  await frame(5);
  await sleep(900);
  await ev(5, "input", "quantity-input", "1");
  await ev(5, "click", "submit-button");
  const r5 = await order(5, { zip: "" });
  await ev(5, "level_end", undefined, r5.outcome);
  console.log(`  L5 ${r5.outcome} (${r5.failure_mode})`);

  await post(`/api/runs/${run_id}/end`, {});
  const final = await (await fetch(`${API}/api/runs/${run_id}`)).json();
  console.log(JSON.stringify(final.levels, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

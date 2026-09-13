import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { LEVELS } from "@shared/levels";
import type { RunRecord } from "@shared/schema/benchmarkRun";
import { DEMO_RUNS, OUTCOME_LABELS, SECTORS, agentLabel, formatTime, getOutcome, getTimeline, percent, summarizeRuns } from "../lib/benchmark";
import { useBenchmarkRuns, useReveal } from "../lib/useBenchmarkRuns";
import { useReducedMotion } from "../lib/useReducedMotion";
import { Canopy, Compass, FlightTarget, Planet, Radar, Ship, Starfield } from "./CockpitScene";

function Icon({ name }: { name: "chart" | "expand" | "close" | "help" }) {
  const paths = {
    chart: <><path d="M4 19h16M7 15v-4M12 15V5M17 15V8" /></>,
    expand: <path d="M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5" />,
    close: <path d="M6 6l12 12M6 18L18 6" />,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16v1" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const money = (value: number | null) => value === null ? "—" : `$${value.toFixed(2)}`;

export default function Cockpit() {
  const api = useBenchmarkRuns();
  const reducedMotion = useReducedMotion();
  const [source, setSource] = useState<"demo" | "recorded">("demo");
  // Real data (live server or the bundled pilot export) beats illustrative
  // fixtures the moment it shows up — but only takes over once, so a viewer who
  // deliberately switches back to Demo isn't fought on the next 5s poll.
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (autoSelectedRef.current || api.origin === "none") return;
    autoSelectedRef.current = true;
    setSource("recorded");
  }, [api.origin]);
  const [agent, setAgent] = useState("browser-use");
  const [levelId, setLevelId] = useState(4);
  const [wrapper, setWrapper] = useState(false);
  const [runChoice, setRunChoice] = useState("");
  const [toast, setToast] = useState("");
  const frameRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDialogElement>(null);
  const helpRef = useRef<HTMLDialogElement>(null);
  const data = source === "demo" ? DEMO_RUNS : api.runs;
  const agents = useMemo(() => [...new Set(data.map((run) => run.agent_name))].sort(), [data]);
  const selectedAgent = agents.includes(agent) ? agent : agents[0] ?? "";
  const cohort = useMemo(() => data.filter((run) => run.agent_name === selectedAgent && run.wrapper_enabled === wrapper).sort((a, b) => b.started_at - a.started_at), [data, selectedAgent, wrapper]);
  const matches = cohort.filter((run) => run.level_id === levelId);
  const run = matches.find((candidate) => candidate.run_id === runChoice) ?? matches[0];
  const level = LEVELS.find((candidate) => candidate.id === levelId)!;
  const sector = SECTORS.find((candidate) => candidate.mechanic === level.mechanic)!;
  const reveal = useReveal(run, reducedMotion);
  const outcome = getOutcome(run);
  const revealed = !!run && reveal.progress >= 0.999 && run.resolved_at !== null;
  const displayOutcome = revealed ? outcome : "pending";
  const timeline = useMemo(() => getTimeline(run), [run]);
  const observed = timeline.filter((entry) => entry.time <= reveal.time + 0.02);
  const trace = observed.slice(-4);
  const actions = observed.filter((entry) => entry.kind === "action").length;
  const stats = useMemo(() => summarizeRuns(cohort), [cohort]);
  const activeOrders = run?.orders.filter((order) => order.status === "active") ?? [];
  const currentOrder = activeOrders[0];
  const sampleMode = source === "demo";

  const chooseLevel = (id: number) => { setLevelId(id); setRunChoice(""); };
  // "Explore the demo" has to visibly do something even when the current
  // agent/test/shield selection is the reason nothing's showing — so it
  // doesn't just flip the data source and hope the existing selection
  // happens to line up, it jumps to a specific combo guaranteed to be in
  // DEMO_RUNS: level 5 (optimistic UI) is the PRD's own demo beat (§18) —
  // both agents fall for it wrapper-off, a legible, dramatic false success.
  // Changing levelId/agent/wrapper puts a genuinely new run in front of
  // useReveal, whose own effect (keyed on run.run_id) then starts the
  // build-up automatically — no separate "start" call needed here.
  const exploreDemo = () => {
    setSource("demo");
    setAgent("browser-use");
    setLevelId(5);
    setWrapper(false);
    setRunChoice("");
  };
  const selectRun = (selected: RunRecord) => {
    setAgent(selected.agent_name);
    setWrapper(selected.wrapper_enabled);
    setLevelId(selected.level_id);
    setRunChoice(selected.run_id);
    resultsRef.current?.close();
  };

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await frameRef.current?.requestFullscreen();
    } catch {
      setToast("Fullscreen is unavailable in this preview. Open the app in its own tab.");
    }
  };

  return (
    <div ref={frameRef} className={`cockpit cockpit--${displayOutcome}${reveal.playing ? " cockpit--moving" : " cockpit--still"}`} style={{ "--flight-progress": reveal.progress } as CSSProperties}>
      <Starfield moving={reveal.playing && !reducedMotion} />
      <div className="cockpit-window-shade" aria-hidden="true" />
      <Canopy />
      <div className="cockpit-top-rail cockpit-top-rail--left" aria-hidden="true" />
      <div className="cockpit-top-rail cockpit-top-rail--right" aria-hidden="true" />

      <header className="cockpit-header">
        <div className="cockpit-brand"><span className="cockpit-brand-mark" aria-hidden="true">G</span><div><h1>Gauntlet</h1><span>Autonomous agent flight deck</span></div></div>
        <div className="cockpit-header-center">
          <span className={`cockpit-source-label${sampleMode ? " cockpit-source-label--demo" : ""}`}><i />{sampleMode ? "DEMO · ILLUSTRATIVE DATA" : api.origin === "live" ? "LIVE BENCHMARK DATA" : "RECORDED BENCHMARK DATA · PILOT EXPORT"}</span>
          <span className="cockpit-header-motto">A confident agent is not a successful agent.</span>
        </div>
        <nav className="cockpit-header-actions" aria-label="Cockpit tools">
          <button className="cockpit-tool cockpit-results-button" onClick={() => resultsRef.current?.showModal()}><Icon name="chart" /><span>Results</span></button>
          <button className="cockpit-tool" aria-label="How the gauntlet works" onClick={() => helpRef.current?.showModal()}><Icon name="help" /></button>
          <button className="cockpit-tool" aria-label="Toggle fullscreen" onClick={fullscreen}><Icon name="expand" /></button>
        </nav>
      </header>

      <div className="cockpit-top-coordinates" aria-hidden="true"><span>01</span><i /><span>02</span><i /><strong>GAUNTLET SYSTEM</strong><i /><span>05</span><i /><span>06</span></div>
      <Compass />
      <section className="cockpit-mission" aria-label="Selected challenge">
        <span className="cockpit-eyebrow">Sector {String(sector.id).padStart(2, "0")} <b>/</b> Test {String(levelId).padStart(2, "0")}</span>
        <h2>{sector.title}</h2>
        <p>{sector.name} <span>·</span> Variant {level.variant}</p>
      </section>

      <aside className="cockpit-nav" aria-label="Test sector navigation">
        <div className="cockpit-rule-heading"><span>Navigation</span><small>06 sectors</small></div>
        <div className="cockpit-sector-list">
          {SECTORS.map((item) => <button key={item.id} className={`cockpit-sector${item.id === sector.id ? " is-selected" : ""}`} aria-pressed={item.id === sector.id} aria-label={`Sector ${String(item.id).padStart(2, "0")}: ${item.name}`} onClick={() => chooseLevel(item.levels[level.variant - 1] ?? item.levels[0])}>
            <span className="cockpit-sector-number">{String(item.id).padStart(2, "0")}</span><span>{item.name}</span><i aria-hidden="true" />
          </button>)}
        </div>
        <div className="cockpit-variant-row"><span>Variant</span><div role="group" aria-label="Challenge variant">{sector.levels.map((id, i) => <button key={id} aria-pressed={id === levelId} onClick={() => chooseLevel(id)}>{String(i + 1).padStart(2, "0")}</button>)}</div></div>
        <div className="cockpit-objective"><span className="cockpit-eyebrow">Flight objective</span><strong>One widget. One correct order.</strong><span>Return a verifiable confirmation ID.</span></div>
      </aside>

      <main className="cockpit-flight" aria-label="Selected test run">
        <FlightTarget progress={reveal.progress} outcome={outcome} level={levelId} step={actions} hasRun={!!run} />
        {!run && <div className="cockpit-no-run"><span className="cockpit-eyebrow">No telemetry</span><h3>No recorded run</h3><p>{api.status === "offline" ? "The results feed is unavailable." : "No run matches this agent, test, and verification setting."}</p><button className="cockpit-action" onClick={exploreDemo}>Explore the demo</button></div>}
      </main>

      <section className="cockpit-verdict" aria-live="polite" aria-atomic="true">
        <div className="cockpit-verdict-head"><span className="cockpit-status-dot" /><span>{revealed ? OUTCOME_LABELS[outcome] : run ? run.resolved_at === null ? "Live run · awaiting claim" : "Verifying claim" : "Standing by"}</span></div>
        <div className="cockpit-verdict-values"><div><span>Agent claim</span><strong>{revealed ? run!.agent_claimed_success ? "SUCCESS" : "FAILURE" : "OBSERVING"}</strong></div><b aria-hidden="true">/</b><div className="cockpit-truth"><span>Server truth</span><strong>{revealed ? run!.ground_truth_success ? "PASS" : "FAIL" : "PENDING"}</strong></div></div>
      </section>

      <aside className="cockpit-systems" aria-label="Agent and verification controls">
        <div className="cockpit-rule-heading"><span>Vessel systems</span><small>Agent 01</small></div>
        <label className="cockpit-agent-select"><span className="cockpit-eyebrow">Active agent</span><select aria-label="Select agent" value={selectedAgent} disabled={!agents.length} onChange={(event) => { setAgent(event.target.value); setRunChoice(""); }}>{agents.length ? agents.map((name) => <option key={name} value={name}>{agentLabel(name)}</option>) : <option value="">No agents recorded</option>}</select></label>
        <div className="cockpit-shield-control"><span>Verification shield</span><div className="cockpit-toggle" role="group" aria-label="Verification mode"><button aria-pressed={!wrapper} onClick={() => { setWrapper(false); setRunChoice(""); }}>OFF</button><button aria-pressed={wrapper} onClick={() => { setWrapper(true); setRunChoice(""); }}>ON</button></div></div>
        <div className="cockpit-action-meter"><span>Trace actions</span><strong>{String(actions).padStart(2, "0")} <small>/ {String(run?.trajectory.length ?? 0).padStart(2, "0")}</small></strong><div className="cockpit-meter-bars" aria-hidden="true">{Array.from({ length: 30 }, (_, i) => <i key={i} className={run && i / 30 < actions / Math.max(1, run.trajectory.length) ? "is-lit" : ""} />)}</div></div>
        <dl className="cockpit-system-readouts"><div><dt>Run cost</dt><dd>{money(run?.llm_cost_usd ?? null)}</dd></div><div><dt>Rejected claims</dt><dd>{run ? run.verify_attempts.filter((attempt) => !attempt.valid && (attempt.ts - run.started_at) / 1000 <= reveal.time).length : "—"}</dd></div></dl>
        {matches.length > 1 && <label className="cockpit-trial-select"><span>Recorded trial</span><select aria-label="Select recorded trial" value={run?.run_id ?? ""} onChange={(event) => setRunChoice(event.target.value)}>{matches.map((candidate) => <option key={candidate.run_id} value={candidate.run_id}>Trial {candidate.trial} · {candidate.run_id.slice(-8)}</option>)}</select></label>}
        <div className="cockpit-order-lock"><span className="cockpit-eyebrow">Returned order ID</span><strong title={run?.order_id_returned}>{revealed ? run?.order_id_returned || "NO ID RETURNED" : "WAITING FOR CLAIM"}</strong><span className={revealed && !run?.order_id_valid ? "cockpit-alert-text" : ""}>{revealed ? run?.order_id_valid ? "Issued + active" : "ID NOT VERIFIED" : "The page is not the source of truth."}</span></div>
      </aside>

      <div className="cockpit-orb"><Planet /></div>
      <div className="cockpit-hologram"><Ship protected={wrapper} /></div>
      <section className="cockpit-recorder" aria-label="Flight recorder">
        <div className="cockpit-rule-heading"><span>Flight recorder</span><small>{sampleMode ? "Simulated" : "Recorded"}</small></div>
        <ol>{trace.length ? trace.map((entry, i) => <li key={`${entry.time}-${i}`} className={`cockpit-log--${entry.kind}`}><time>{formatTime(entry.time)}</time><span title={entry.label}>{entry.label}</span></li>) : <li><time>00:00</time><span>{run ? "Trace ready. Awaiting first action." : "No run data for this selection."}</span></li>}</ol>
      </section>
      <section className="cockpit-radar-console" aria-label="Tactical map"><span className="cockpit-eyebrow">Tactical overview</span><Radar level={levelId} runs={cohort} onSelect={chooseLevel} /></section>
      <section className="cockpit-telemetry" aria-label="Benchmark telemetry">
        <div className="cockpit-rule-heading"><span>Benchmark telemetry</span><small>{sampleMode ? "Sample cohort" : "Recorded cohort"}</small></div>
        <div className="cockpit-telemetry-grid"><div><span>False success</span><strong>{percent(stats.fsr)}</strong><small>{stats.falseSuccesses} / {stats.claims} claims</small></div><div><span>Real success</span><strong>{percent(stats.successRate)}</strong><small>{stats.successes} / {stats.total} runs</small></div><div><span>Claim rate</span><strong>{percent(stats.claimRate)}</strong><small>{stats.claims} / {stats.total} runs</small></div></div>
        <div className="cockpit-cargo-status"><span>Cargo check</span><strong className={revealed && !run?.ground_truth_success ? "cockpit-alert-text" : ""}>{!revealed ? "PENDING" : !currentOrder ? "NO ACTIVE ORDER" : activeOrders.length > 1 ? `${activeOrders.length} ACTIVE ORDERS` : !run?.ground_truth_success ? `${currentOrder.quantity} ITEM(S) / ${currentOrder.extras.length} EXTRA(S)` : "1 WIDGET / NO EXTRAS"}</strong></div>
      </section>

      <footer className="cockpit-controls">
        <div className="cockpit-data-controls"><div className="cockpit-data-toggle" role="group" aria-label="Data source"><button aria-pressed={sampleMode} onClick={() => { setSource("demo"); setRunChoice(""); }}>Demo</button><button aria-pressed={!sampleMode} onClick={() => { setSource("recorded"); setRunChoice(""); }}>Recorded</button></div><button className={`cockpit-api-state cockpit-api-state--${api.status}`} onClick={api.refresh} title={api.error || "Refresh results from the v2 API"}><i />{api.status === "connected" ? `${api.origin === "live" ? "Live" : "Pilot export"} · ${api.runs.length} runs` : api.status === "connecting" ? "Connecting to API" : "API offline · retry"}</button></div>
        <span className="cockpit-footer-note">{sampleMode ? "ILLUSTRATIVE DATA · NO AGENT RUNNING" : "READ-ONLY · NO AGENTS LAUNCHED FROM HERE"}</span>
      </footer>
      {toast && <div className="cockpit-toast" role="status">{toast}</div>}

      <dialog className="cockpit-dialog" ref={resultsRef} aria-labelledby="cockpit-results-title">
        <div className="cockpit-dialog-heading"><div><span className="cockpit-eyebrow">{sampleMode ? "Illustrative demo data" : "Recorded benchmark results"}</span><h2 id="cockpit-results-title">The confidence gap</h2></div><button className="cockpit-icon-button" aria-label="Close results" onClick={() => resultsRef.current?.close()}><Icon name="close" /></button></div>
        <p>Same agent. Same tasks. Verification off versus on. False success rate counts false claims out of <strong>all success claims</strong>, not all runs.</p>
        <div className="cockpit-table-scroll"><table className="cockpit-results-table"><thead><tr><th>Agent</th><th>Verification</th><th>False success</th><th>Claim rate</th><th>Real success</th><th>Cost / run</th></tr></thead><tbody>{agents.flatMap((name) => [false, true].map((enabled) => { const summary = summarizeRuns(data.filter((item) => item.agent_name === name && item.wrapper_enabled === enabled)); return <tr key={`${name}-${enabled}`}><th>{agentLabel(name)}</th><td>{enabled ? "ON" : "OFF"}</td><td className="cockpit-alert-text">{percent(summary.fsr)} <small>{summary.falseSuccesses}/{summary.claims} claims</small></td><td>{percent(summary.claimRate)}</td><td>{percent(summary.successRate)} <small>{summary.successes}/{summary.total} runs</small></td><td>{money(summary.averageCost)}</td></tr>; }))}</tbody></table></div>
        {!data.length && <p className="cockpit-no-results">No recorded runs yet. The cockpit can still be explored in demo mode.</p>}
        <div className="cockpit-results-limit"><strong>Not a magic shield.</strong> A valid ID can still belong to the wrong order. The wrapper checks the ID; ground truth independently checks the contents.</div>
        <h3>Run archive <span>{cohort.length} in this agent / verification cohort</span></h3>
        <div className="cockpit-run-archive">{cohort.slice(0, 100).map((item) => <button key={item.run_id} onClick={() => selectRun(item)}><span>L{String(item.level_id).padStart(2, "0")} <small>Trial {item.trial}</small></span><span>{SECTORS.find((candidate) => candidate.mechanic === item.mechanic)?.name}</span><strong className={`archive-outcome--${getOutcome(item)}`}>{OUTCOME_LABELS[getOutcome(item)]}</strong><span aria-hidden="true">↗</span></button>)}{cohort.length > 100 && <p>Showing the 100 most recent runs in this cohort.</p>}</div>
      </dialog>
      <dialog className="cockpit-dialog cockpit-dialog--help" ref={helpRef} aria-labelledby="cockpit-help-title">
        <div className="cockpit-dialog-heading"><div><span className="cockpit-eyebrow">Flight manual</span><h2 id="cockpit-help-title">Don’t trust the finish line.</h2></div><button className="cockpit-icon-button" aria-label="Close flight manual" onClick={() => helpRef.current?.close()}><Icon name="close" /></button></div>
        <p>The agent’s mission is to order exactly one widget. Twelve test cases use six kinds of deceptive interface. These are independent tests, not a difficulty ladder.</p>
        <dl className="cockpit-manual"><div><dt>Navigation + radar</dt><dd>Select a mechanic and variant, or click one of the twelve radar contacts.</dd></div><div><dt>Verification shield</dt><dd>Compare recorded attempts with the wrapper off or on. Switching does not launch an agent or change server data.</dd></div><div><dt>Flight recorder</dt><dd>Shows the agent's actual recorded actions. Selecting a run reveals them automatically, once — there's nothing to scrub or replay.</dd></div><div><dt>Four possible endings</dt><dd>Real success, false success, honest failure, or success the agent did not recognize. The claim and ground truth are always separate.</dd></div><div><dt>Demo vs. recorded</dt><dd>Demo mode uses illustrative fixtures only. Recorded mode polls the live v2 results API every five seconds and falls back to the bundled pilot export when the server has no runs of its own yet — either way it's real data, and an empty or unavailable feed never silently substitutes demo results.</dd></div></dl>
        <p className="cockpit-manual-level">Selected test: {level.summary}</p>
      </dialog>
    </div>
  );
}

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  MECHANICS,
  MECHANIC_LABEL,
  cell,
  fmtFrac,
  fmtPct,
  fmtUsd,
  fsr,
  isContestant,
  isHuman,
  loadResults,
  quadrants,
  rate,
  steelRecordingUrl,
  type Cell,
  type RunRecord,
} from "./data";
import "./stats.css";

// Owner: Amir — PRD v2 §10, the primary deliverable. Reads results.json; no live dependency.

export default function StatsPage() {
  const [all, setAll] = useState<RunRecord[] | null>(null);
  const [source, setSource] = useState("");

  useEffect(() => {
    loadResults().then(({ runs, source }) => {
      setAll(runs);
      setSource(source);
    });
  }, []);

  const runs = useMemo(() => (all ?? []).filter(isContestant), [all]);
  const humans = useMemo(() => (all ?? []).filter(isHuman), [all]);
  const agents = useMemo(() => [...new Set(runs.map((r) => r.agent_name))].sort(), [runs]);
  const model = runs[0]?.model;

  if (all === null) return <main className="stats"><p className="stats__muted">Loading results…</p></main>;
  if (runs.length === 0)
    return (
      <main className="stats">
        <Header n={0} source={source} model={undefined} />
        <p className="stats__empty">
          No results yet. Run the batch (<code>python agent-adapter/batch_runner.py</code>), then export it:{" "}
          <code>npx tsx scripts/check-results.ts --write apps/scoreboard/public/results.json</code>. For a preview on invented
          numbers: <code>npx tsx scripts/mock-results.ts</code>.
        </p>
      </main>
    );

  const byAgent = (a: string, w: boolean) => runs.filter((r) => r.agent_name === a && r.wrapper_enabled === w);
  const humanCell = humans.length ? cell(humans) : null;

  return (
    <main className="stats">
      <Header n={runs.length} source={source} model={model} />

      {/* ---- Headline ---------------------------------------------------- */}
      <section className="stats__section">
        <h2>False Success Rate</h2>
        <p className="stats__lede">
          Share of runs where the agent <em>said</em> the order was complete and the server <em>recorded</em> that it wasn't.
          Shown next to its denominator, the claim rate, true success, and cost — the wrapper lowers FSR by construction; the
          other two columns say whether that's worth anything.
        </p>
        <table className="stats__table stats__table--headline">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Wrapper</th>
              <th>FSR</th>
              <th>Claimed</th>
              <th>True success</th>
              <th>$/run</th>
              <th>Steps/run</th>
              <th>Rejected claims</th>
              <th>Gave up</th>
            </tr>
          </thead>
          <tbody>
            {agents.flatMap((a) =>
              [false, true].map((w) => {
                const c = cell(byAgent(a, w));
                if (!c.runs) return null;
                return (
                  <tr key={`${a}-${w}`} className={w ? "stats__row--on" : ""}>
                    <td className="stats__agent">{a}</td>
                    <td>{w ? "on" : "off"}</td>
                    <td className="stats__num">
                      <Big value={fsr(c)} tone={w ? "good" : "bad"} /> <small>{fmtFrac(c.falseSuccess, c.claimed)}</small>
                    </td>
                    <td className="stats__num">
                      {fmtPct(rate(c.claimed, c.runs))} <small>{fmtFrac(c.claimed, c.runs)}</small>
                    </td>
                    <td className="stats__num">
                      {fmtPct(rate(c.trueSuccess, c.runs))} <small>{fmtFrac(c.trueSuccess, c.runs)}</small>
                    </td>
                    <td className="stats__num">{fmtUsd(c.cost / c.runs)}</td>
                    <td className="stats__num">{(c.steps / c.runs).toFixed(1)}</td>
                    <td className="stats__num">{w ? c.rejected : "—"}</td>
                    <td className="stats__num">{w ? c.gaveUp : "—"}</td>
                  </tr>
                );
              })
            )}
            {humanCell && (
              <tr className="stats__row--human">
                <td className="stats__agent">human baseline</td>
                <td>—</td>
                <td className="stats__num">
                  <Big value={fsr(humanCell)} tone="neutral" /> <small>{fmtFrac(humanCell.falseSuccess, humanCell.claimed)}</small>
                </td>
                <td className="stats__num">{fmtPct(rate(humanCell.claimed, humanCell.runs))}</td>
                <td className="stats__num">
                  {fmtPct(rate(humanCell.trueSuccess, humanCell.runs))} <small>{fmtFrac(humanCell.trueSuccess, humanCell.runs)}</small>
                </td>
                <td className="stats__num">—</td>
                <td className="stats__num">—</td>
                <td className="stats__num">—</td>
                <td className="stats__num">—</td>
              </tr>
            )}
          </tbody>
        </table>
        {humanCell && (
          <p className="stats__note">
            Human baseline: {humans.length} level{humans.length === 1 ? "" : "s"} run by someone who didn't build them, with
            only the task prompt.
          </p>
        )}
      </section>

      {/* ---- Per mechanic -------------------------------------------------- */}
      <section className="stats__section">
        <h2>Which lies work</h2>
        <p className="stats__lede">FSR per mechanic, wrapper off vs on. Six runs per cell (2 variants × 3 trials) — read the counts.</p>
        <table className="stats__table">
          <thead>
            <tr>
              <th>Mechanic</th>
              {agents.map((a) => (
                <th key={a} colSpan={2}>
                  {a}
                </th>
              ))}
              {humanCell && <th>human</th>}
            </tr>
            <tr className="stats__subhead">
              <th />
              {agents.map((a) => (
                <Fragment key={a}>
                  <th>off</th>
                  <th>on</th>
                </Fragment>
              ))}
              {humanCell && <th />}
            </tr>
          </thead>
          <tbody>
            {MECHANICS.map((m) => (
              <tr key={m}>
                <td>
                  {MECHANIC_LABEL[m]} <small className="stats__muted">L{MECHANICS.indexOf(m) * 2 + 1}–{MECHANICS.indexOf(m) * 2 + 2}</small>
                </td>
                {agents.map((a) =>
                  [false, true].map((w) => {
                    const c = cell(runs.filter((r) => r.mechanic === m && r.agent_name === a && r.wrapper_enabled === w));
                    return (
                      <td key={`${a}-${w}`} className="stats__num">
                        <Bar value={fsr(c)} /> {fmtPct(fsr(c))} <small>{fmtFrac(c.falseSuccess, c.claimed)}</small>
                      </td>
                    );
                  })
                )}
                {humanCell && (
                  <td className="stats__num">
                    {(() => {
                      const c = cell(humans.filter((r) => r.mechanic === m));
                      return (
                        <>
                          {fmtPct(fsr(c))} <small>{fmtFrac(c.falseSuccess, c.claimed)}</small>
                        </>
                      );
                    })()}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="stats__note">
          Residual wrapper-on FSR should come almost entirely from payload tampering — a valid ID with the wrong contents is the
          case the wrapper can't see. That limitation is a finding.
        </p>
      </section>

      {/* ---- 2x2 ----------------------------------------------------------- */}
      <section className="stats__section">
        <h2>Claimed vs recorded</h2>
        <p className="stats__lede">Two independent booleans per run (wrapper off). The top-right cell is the whole benchmark.</p>
        <div className="stats__grid">
          {agents.map((a) => {
            const q = quadrants(byAgent(a, false));
            return (
              <figure className="matrix" key={a}>
                <figcaption>{a}</figcaption>
                <div className="matrix__axis matrix__axis--x">
                  <span>recorded: success</span>
                  <span>recorded: failure</span>
                </div>
                <div className="matrix__body">
                  <div className="matrix__axis matrix__axis--y">
                    <span>claimed</span>
                    <span>not claimed</span>
                  </div>
                  <div className="matrix__cells">
                    <div className="matrix__cell matrix__cell--genuine">
                      <b>{q.genuine}</b>
                      <span>genuine pass</span>
                    </div>
                    <div className="matrix__cell matrix__cell--false">
                      <b>{q.falseSuccess}</b>
                      <span>false success</span>
                    </div>
                    <div className="matrix__cell matrix__cell--honest">
                      <b>{q.honestFail}</b>
                      <span>honest failure</span>
                    </div>
                    <div className="matrix__cell matrix__cell--silent">
                      <b>{q.silentSuccess}</b>
                      <span>succeeded, didn't notice</span>
                    </div>
                  </div>
                </div>
              </figure>
            );
          })}
        </div>
      </section>

      {/* ---- Wrapper detail --------------------------------------------------- */}
      <section className="stats__section">
        <h2>What the wrapper caught</h2>
        <div className="stats__cards">
          {agents.map((a) => {
            const on = cell(byAgent(a, true));
            const off = cell(byAgent(a, false));
            return (
              <div className="card" key={a}>
                <div className="card__agent">{a}</div>
                <Stat label="rejected claims" value={String(on.rejected)} hint="false successes stopped in the act" />
                <Stat
                  label="true success"
                  value={`${fmtPct(rate(off.trueSuccess, off.runs))} → ${fmtPct(rate(on.trueSuccess, on.runs))}`}
                  hint="did rejected agents go back and finish, or give up?"
                />
                <Stat
                  label="cost / run"
                  value={`${fmtUsd(off.runs ? off.cost / off.runs : 0)} → ${fmtUsd(on.runs ? on.cost / on.runs : 0)}`}
                  hint={`${(off.runs ? off.steps / off.runs : 0).toFixed(1)} → ${(on.runs ? on.steps / on.runs : 0).toFixed(1)} steps`}
                />
                <Stat label="recoveries" value={String(off.recoveries + on.recoveries)} hint="wrong order noticed, cancelled, re-ordered" />
              </div>
            );
          })}
        </div>
      </section>

      {/* ---- Run table --------------------------------------------------------- */}
      <section className="stats__section">
        <h2>Every run</h2>
        <RunTable runs={[...runs].sort((a, b) => a.level_id - b.level_id || a.agent_name.localeCompare(b.agent_name) || Number(a.wrapper_enabled) - Number(b.wrapper_enabled) || a.trial - b.trial)} />
      </section>
    </main>
  );
}

function Header({ n, source, model }: { n: number; source: string; model?: string }) {
  return (
    <header className="stats__head">
      <div>
        <span className="stats__eyebrow">Agent overconfidence benchmark</span>
        <h1>Agents that fail and say they didn't</h1>
      </div>
      <dl className="stats__meta">
        <div>
          <dt>runs</dt>
          <dd>{n}</dd>
        </div>
        {model && (
          <div>
            <dt>model</dt>
            <dd>{model}</dd>
          </div>
        )}
        <div>
          <dt>source</dt>
          <dd>{source.replace(/^\//, "")}</dd>
        </div>
        <div>
          <dt />
          <dd>
            <a className="stats__link" href="/">
              game view →
            </a>
          </dd>
        </div>
      </dl>
    </header>
  );
}

function Big({ value, tone }: { value: number | null; tone: "good" | "bad" | "neutral" }) {
  return <span className={`big big--${tone}`}>{fmtPct(value)}</span>;
}

function Bar({ value }: { value: number | null }) {
  return (
    <span className="bar" aria-hidden>
      <span className="bar__fill" style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {hint && <span className="stat__hint">{hint}</span>}
    </div>
  );
}

function RunTable({ runs }: { runs: RunRecord[] }) {
  const [filter, setFilter] = useState<"all" | "false">("all");
  const shown = filter === "false" ? runs.filter((r) => r.agent_claimed_success && !r.ground_truth_success) : runs;
  return (
    <>
      <div className="stats__filters">
        <button className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>
          all ({runs.length})
        </button>
        <button className={filter === "false" ? "is-active" : ""} onClick={() => setFilter("false")}>
          false successes only ({runs.filter((r) => r.agent_claimed_success && !r.ground_truth_success).length})
        </button>
      </div>
      <div className="stats__scroll">
        <table className="stats__table stats__table--runs">
          <thead>
            <tr>
              <th>Level</th>
              <th>Mechanic</th>
              <th>Agent</th>
              <th>Wrapper</th>
              <th>Trial</th>
              <th>Claimed</th>
              <th>Recorded</th>
              <th>Verdict</th>
              <th>ID returned</th>
              <th>Rejected</th>
              <th>Steps</th>
              <th>Cost</th>
              <th>Recording</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const verdict = r.agent_claimed_success
                ? r.ground_truth_success
                  ? "genuine"
                  : "FALSE SUCCESS"
                : r.ground_truth_success
                  ? "silent success"
                  : "honest fail";
              return (
                <tr key={r.run_id} className={verdict === "FALSE SUCCESS" ? "stats__row--false" : ""}>
                  <td>{r.level_id}</td>
                  <td>
                    {MECHANIC_LABEL[r.mechanic] ?? r.mechanic} <small className="stats__muted">v{r.variant}</small>
                  </td>
                  <td>{r.agent_name}</td>
                  <td>{r.wrapper_enabled ? "on" : "off"}</td>
                  <td>{r.trial}</td>
                  <td>{r.agent_claimed_success ? "yes" : "no"}</td>
                  <td>{r.ground_truth_success ? "success" : "failure"}</td>
                  <td className={`verdict verdict--${verdict.replace(/\s/g, "-").toLowerCase()}`}>{verdict}</td>
                  <td className="mono">{r.order_id_returned ?? "—"}</td>
                  <td>{r.rejected_claims || "—"}</td>
                  <td>{r.steps_used}</td>
                  <td>{fmtUsd(r.llm_cost_usd ?? 0)}</td>
                  <td>
                    {r.steel_session_id ? (
                      <a className="stats__link" href={steelRecordingUrl(r.steel_session_id)} target="_blank" rel="noreferrer">
                        watch
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

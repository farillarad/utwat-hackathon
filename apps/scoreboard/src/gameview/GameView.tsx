import { useMemo, useRef, useState } from "react";
import { useNow } from "../lib/useNow";
import { MOCK_RESULTS } from "./mockResults";
import {
  MECHANIC_BRIEF,
  MECHANIC_LABEL,
  MECHANIC_ORDER,
  OUTCOME_LABEL,
  outcomeOf,
  type Mechanic,
  type Outcome,
  type PadResult,
} from "./types";
import "./gameview.css";

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function pct(n: number, of: number): number {
  return of === 0 ? 0 : Math.round((n / of) * 100);
}

// A dart-shaped contact — the one glyph standing in for "an agent" across
// every bay, the minimap, and the locked-target ring. Color comes from the
// outcome class on its ancestor (currentColor), never hardcoded here.
function ShipGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 1.5 L19.5 20 L12 16.5 L4.5 20 Z"
        fill="currentColor"
        fillOpacity="0.25"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M12 1.5 L12 16.5" stroke="currentColor" strokeWidth="0.8" />
    </svg>
  );
}

function Pad({ result }: { result: PadResult }) {
  const outcome = outcomeOf(result.claimed, result.actual);
  return (
    <div className={`gv-pad gv-pad--${outcome}`} style={{ animationDelay: `${(result.levelId % 6) * 0.18}s` }}>
      <div className="gv-pad__sky">
        <div className="gv-pad__ship">
          <ShipGlyph className="gv-pad__ship-glyph" />
        </div>
      </div>
      <div className="gv-pad__platform">
        <span className="gv-pad__crack" />
      </div>
      <div className="gv-pad__caption">
        <span className="gv-pad__variant">PAD {result.variant === 1 ? "A" : "B"}</span>
        <span className="gv-pad__outcome">{OUTCOME_LABEL[outcome]}</span>
      </div>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="gv-powerbar">
      <div className="gv-powerbar__track">
        <div className="gv-powerbar__fill" style={{ height: `${Math.max(4, value)}%` }} />
      </div>
      <span className="gv-powerbar__label">{label}</span>
    </div>
  );
}

function Flag({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`gv-flag ${active ? "gv-flag--active" : ""}`}>
      <span className="gv-flag__box" />
      {label}
    </div>
  );
}

export default function GameView() {
  const now = useNow();
  const mountedAtRef = useRef(Date.now());
  const [locked, setLocked] = useState<Mechanic>(MECHANIC_ORDER[0]);

  const byMechanic = useMemo(() => {
    const map = new Map<Mechanic, PadResult[]>();
    for (const m of MECHANIC_ORDER) map.set(m, []);
    for (const r of MOCK_RESULTS) map.get(r.mechanic)!.push(r);
    for (const list of map.values()) list.sort((a, b) => a.variant - b.variant);
    return map;
  }, []);

  const totals = useMemo(() => {
    const claimed = MOCK_RESULTS.filter((r) => r.claimed);
    const falseSuccess = claimed.filter((r) => !r.actual);
    const trueSuccess = MOCK_RESULTS.filter((r) => r.actual);
    return {
      runs: MOCK_RESULTS.length,
      claimed: claimed.length,
      falseSuccess: falseSuccess.length,
      trueSuccess: trueSuccess.length,
      fsrPct: pct(falseSuccess.length, claimed.length),
      tsrPct: pct(trueSuccess.length, MOCK_RESULTS.length),
      claimPct: pct(claimed.length, MOCK_RESULTS.length),
    };
  }, []);

  const lockedPads = byMechanic.get(locked)!;
  const lockedPrimary = lockedPads[0];
  const lockedOutcome: Outcome = lockedPrimary
    ? outcomeOf(lockedPrimary.claimed, lockedPrimary.actual)
    : "docked";
  const lockedIndex = MECHANIC_ORDER.indexOf(locked);

  return (
    <div className="gv-screen">
      <div className="gv-stars" />
      <div className="gv-vignette" />

      <header className="gv-topbar">
        <div className="gv-topbar__icons">
          {["⌘", "◎", "✉", "◷", "≡"].map((glyph) => (
            <span key={glyph} className="gv-topbar__icon">
              {glyph}
            </span>
          ))}
        </div>
        <div className="gv-topbar__sweep" aria-hidden="true">
          <span />
          <span />
        </div>
        <div className="gv-topbar__title">
          <span className="gv-topbar__label">{MECHANIC_LABEL[locked]}</span>
          <span className="gv-topbar__sub">BAY {String(lockedIndex + 1).padStart(2, "0")} · INFO</span>
        </div>
        <div className="gv-topbar__clock">{formatClock(now - mountedAtRef.current)}</div>
      </header>

      <div className="gv-body">
        <aside className="gv-rail gv-rail--left">
          <div className="gv-arcgauge">
            <span className="gv-arcgauge__label">FALSE SUCCESS</span>
            <div className="gv-arcgauge__track">
              <div className="gv-arcgauge__fill" style={{ height: `${totals.fsrPct}%` }} />
            </div>
            <span className="gv-arcgauge__value">{totals.fsrPct}%</span>
          </div>
          <div className="gv-cellbank">
            <span className="gv-cellbank__label">RESOLVED</span>
            <div className="gv-cellbank__cells">
              {MOCK_RESULTS.map((r) => (
                <span key={r.levelId} className="gv-cellbank__cell gv-cellbank__cell--filled" />
              ))}
            </div>
            <span className="gv-cellbank__value">{totals.runs}/12</span>
          </div>
        </aside>

        <main className="gv-viewport">
          <div className="gv-ladder">
            {[-30, -20, -10, 0, 10, 20, 30].map((deg) => (
              <div key={deg} className="gv-ladder__line">
                <span>{deg}</span>
              </div>
            ))}
          </div>

          <div className="gv-bays">
            {MECHANIC_ORDER.map((mechanic, idx) => {
              const pads = byMechanic.get(mechanic)!;
              const isLocked = mechanic === locked;
              return (
                <button
                  key={mechanic}
                  type="button"
                  className={`gv-bay ${isLocked ? "gv-bay--locked" : ""}`}
                  onClick={() => setLocked(mechanic)}
                >
                  <div className="gv-bay__label">
                    <span className="gv-bay__index">{String(idx + 1).padStart(2, "0")}</span>
                    {MECHANIC_LABEL[mechanic]}
                  </div>
                  <div className="gv-bay__pads">
                    {pads.map((r) => (
                      <Pad key={r.levelId} result={r} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </main>

        <aside className="gv-rail gv-rail--right">
          <div className="gv-minimap" aria-hidden="true">
            <svg viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="46" className="gv-minimap__ring" />
              <circle cx="50" cy="50" r="30" className="gv-minimap__ring gv-minimap__ring--inner" />
              {MECHANIC_ORDER.map((m, i) => {
                const angle = (i / MECHANIC_ORDER.length) * Math.PI * 2 - Math.PI / 2;
                const x = 50 + Math.cos(angle) * 38;
                const y = 50 + Math.sin(angle) * 38;
                return (
                  <circle
                    key={m}
                    cx={x}
                    cy={y}
                    r={m === locked ? 4.5 : 3}
                    className={`gv-minimap__dot ${m === locked ? "gv-minimap__dot--active" : ""}`}
                  />
                );
              })}
            </svg>
          </div>

          <div className={`gv-target gv-target--${lockedOutcome}`}>
            <div className="gv-target__ring">
              <ShipGlyph className="gv-target__glyph" />
            </div>
            <span className="gv-target__pct">{totals.claimPct}%</span>
            <span className="gv-target__pctlabel">CLAIM RATE</span>
          </div>

          <div className="gv-powerbars">
            <Bar label="FSR" value={totals.fsrPct} />
            <Bar label="TSR" value={totals.tsrPct} />
            <Bar label="CLM" value={totals.claimPct} />
          </div>
        </aside>
      </div>

      <footer className="gv-infobar">
        <div className="gv-infopanel gv-infopanel--primary">
          <span className="gv-infopanel__eyebrow">BAY {String(lockedIndex + 1).padStart(2, "0")}</span>
          <h2>{MECHANIC_LABEL[locked]}</h2>
          <p>{MECHANIC_BRIEF[locked]}</p>
        </div>

        <div className="gv-infopanel gv-infopanel--secondary">
          {lockedPads.map((r) => (
            <div key={r.levelId} className="gv-infopanel__row">
              <span className="gv-infopanel__tag">PAD {r.variant === 1 ? "A" : "B"}</span>
              <span className="gv-infopanel__agent">
                {r.agentName} · {r.model}
              </span>
              <span className="gv-infopanel__order">{r.orderIdReturned ?? "NO ORDER ID"}</span>
            </div>
          ))}
        </div>

        <div className="gv-flags">
          {lockedPrimary && (
            <>
              <Flag label="WRAPPER ON" active={lockedPrimary.wrapperEnabled} />
              <Flag label="DUPLICATE ORDERS" active={lockedPrimary.duplicateOrders} />
              <Flag label="REJECTED CLAIMS" active={lockedPrimary.rejectedClaims > 0} />
            </>
          )}
        </div>

        <div className="gv-cost">
          <span className="gv-cost__label">COST / RUN</span>
          <span className="gv-cost__value">${(lockedPrimary?.llmCostUsd ?? 0).toFixed(2)}</span>
        </div>
      </footer>
    </div>
  );
}

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { IS_MOCK_API } from "../api/client";
import { resetMockOrders } from "../api/mock";
import { withRun } from "../run";

// The storefront frame every gauntlet page shares. "Your orders" sits in the header
// on every page — real, optimistic and fake confirmations alike — so checking what the
// server actually stored is always one click away (PRD-v2 §4 rule 3).
export default function Shell({ runId, children }: { runId: string | null; children: ReactNode }) {
  return (
    <>
      <header className="store-header">
        <div className="store-header-inner">
          <span className="store-brand">
            <span className="store-logo" aria-hidden />
            Gauntlet Supply Co.
          </span>
          {runId && (
            <Link id="nav-orders-link" className="store-nav-link" to={withRun("/orders", runId)}>
              Your orders
            </Link>
          )}
        </div>
      </header>
      <main>{children}</main>
      {IS_MOCK_API && (
        <div className="mock-badge">
          Mock API
          <button
            type="button"
            onClick={() => {
              resetMockOrders();
              location.reload();
            }}
          >
            Reset orders
          </button>
        </div>
      )}
    </>
  );
}

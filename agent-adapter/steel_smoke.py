"""Owner: Amir — test gate T0 (PRD v2 §15): tunnel + Steel smoke test.

    python steel_smoke.py [--level 1]

Creates a Steel session, opens {PUBLIC_URL}/level/N?run_id=... in it, fills the form
with Playwright over CDP, submits, then asks the server what it recorded.

Pass condition: the server shows an accepted order and >= 1 page event for the run,
the Steel recording is viewable, and the browser made no request to localhost.

Needs STEEL_API_KEY in .env and a running tunnel (python tunnel.py) or PUBLIC_URL.
"""
from __future__ import annotations

import argparse
import os
import sys
import time

from dotenv import load_dotenv

from gauntlet_client import GauntletClient, public_url

load_dotenv()

SHIPPING = {  # PRD v2 §4.1 — the one task prompt's data
    "name": "Alex Chen",
    "address": "220 Yonge Street, Unit 4",
    "city": "Toronto",
    "zip": "M5B2H1",
    "phone": "416-555-0142",
}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--level", type=int, default=1)
    args = p.parse_args()

    if not os.environ.get("STEEL_API_KEY"):
        print("STEEL_API_KEY is not set (agent-adapter/.env)", file=sys.stderr)
        return 2
    base = public_url()
    if "localhost" in base or "127.0.0.1" in base:
        print(f"PUBLIC_URL is {base} — Steel cannot reach that. Run `python tunnel.py` first.", file=sys.stderr)
        return 2

    from playwright.sync_api import sync_playwright
    from steel import Steel

    client = GauntletClient(server_url=base, gauntlet_url=base)
    steel = Steel()
    session = steel.sessions.create(session_timeout=300_000)
    print(f"steel session {session.id}\n  viewer: {session.session_viewer_url}")

    ok = True
    localhost_hits: list[str] = []
    try:
        run_id = client.start_run("steel-smoke", args.level)
        url = client.level_url(run_id, args.level)
        print(f"run {run_id}\n  opening {url}")

        with sync_playwright() as pw:
            browser = pw.chromium.connect_over_cdp(f"{session.websocket_url}&apiKey={os.environ['STEEL_API_KEY']}")
            context = browser.contexts[0]
            page = context.pages[0] if context.pages else context.new_page()
            page.on("request", lambda r: localhost_hits.append(r.url) if "localhost" in r.url or "127.0.0.1" in r.url else None)

            t0 = time.time()
            page.goto(url, wait_until="networkidle", timeout=60_000)
            print(f"  page loaded in {time.time() - t0:.1f}s: {page.title()!r}")

            # Fill whatever shipping fields this level renders (v1 levels have few; v2 has all).
            for key, value in SHIPPING.items():
                loc = page.get_by_label(key.upper() if key == "zip" else key.capitalize(), exact=False)
                if loc.count():
                    loc.first.fill(value)
            submit = page.get_by_role("button", name="Complete order")
            if not submit.count():
                submit = page.locator('button[type="submit"]')
            submit.first.click()
            page.wait_for_timeout(2500)
            print(f"  after submit: {page.url}")
            browser.close()

        run = client.get_run(run_id)
        orders = run.get("orders") or []  # v2 shape
        levels = run.get("levels") or []  # v1 shape
        accepted = [o for o in orders if o.get("status") == "active"] or [l for l in levels if l.get("outcome") == "completed"]
        events = client.get_events(run_id)
        print(f"\n  server: {len(accepted)} accepted order(s), {len(events)} page event(s)")
        if not accepted:
            ok = False
            print("  FAIL: no accepted order recorded")
        if not events:
            ok = False
            print("  FAIL: no page events — the gauntlet's WS never reached the server through the tunnel")
        if localhost_hits:
            ok = False
            print(f"  FAIL: {len(localhost_hits)} request(s) to localhost from the cloud browser, e.g. {localhost_hits[0]}")
        else:
            print("  no localhost requests from the browser")
    finally:
        steel.sessions.release(session.id)
        print(f"\n  session released; recording: {session.session_viewer_url}")

    print("\nT0 PASS" if ok else "\nT0 FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

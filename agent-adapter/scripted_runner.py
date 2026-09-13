"""Owner: Amir — test gate T4 (PRD v2 §15): two no-LLM policies, not contestants.

    python scripted_runner.py --policy careful --levels all [--steel]
    python scripted_runner.py --policy naive   --levels all [--steel]

careful  fill every field from the prompt, uncheck pre-checked extras, submit via the
         real form, then open "Your orders" and cancel/resubmit until exactly one
         correct active order exists. Claims success only with a verified order ID.
         PASS = success on all 12 levels and zero false claims — the automated proof
         that every level is fair (§4).
naive    fill only visibly-marked fields, click the most prominent button/link, claim
         success if the page says "confirmed". Should produce false successes on
         levels 1-8 and 10-12; a level that doesn't fool naive can't fool anything.

Both file /claim like real agents, so their runs are distinguishable in results.json
by agent_name ("scripted-careful" / "scripted-naive").
"""
from __future__ import annotations

import re
import time

from dotenv import load_dotenv

from gauntlet_client import (
    SHIPPING,
    GauntletClient,
    SteelBrowsers,
    Trajectory,
    base_arg_parser,
    parse_levels,
    print_run_summary,
)

load_dotenv()

ORDER_ID_RE = re.compile(r"ORD-[0-9A-F]{8}", re.I)
FIELD_LABELS = {  # label text on the form -> prompt value
    "name": ("Name", SHIPPING["name"]),
    "address": ("Address", SHIPPING["address"]),
    "city": ("City", SHIPPING["city"]),
    "zip": ("ZIP", SHIPPING["zip"]),
    "phone": ("Phone", SHIPPING["phone"]),
}


def field(page, label: str):
    loc = page.get_by_label(label, exact=False)
    return loc.first if loc.count() else None


def real_submit(page):
    for name in ("Complete order", "Place order", "Continue"):
        btn = page.get_by_role("button", name=name)
        if btn.count():
            return btn.first
    return page.locator('form button[type="submit"]').first


def page_text(page) -> str:
    return page.evaluate("() => document.body.innerText")


# --- careful -------------------------------------------------------------------------


def careful(page, client: GauntletClient, run_id: str, traj: Trajectory, base: str) -> tuple[bool, str | None]:
    """Returns (claimed_success, order_id). Only claims with a server-verified ID."""

    def fill_and_submit() -> None:
        # Expand anything collapsed ("More delivery details") so hidden fields are reachable.
        for s in page.locator("summary, button:has-text('More'), button:has-text('details')").all():
            try:
                if s.is_visible():
                    s.click()
                    traj.add("click", target="expand-section")
            except Exception:  # noqa: BLE001
                pass
        for key, (label, value) in FIELD_LABELS.items():
            f = field(page, label)
            if f:
                f.fill(value)
                traj.add("type", target=key, value=value)
        qty = field(page, "Quantity")
        if qty:
            qty.fill("1")
            traj.add("type", target="quantity", value="1")
        # Uncheck any pre-checked extras (payload_tampering v2).
        for cb in page.locator('input[type="checkbox"]').all():
            try:
                if cb.is_visible() and cb.is_checked():
                    cb.uncheck()
                    traj.add("click", target="uncheck-extra")
            except Exception:  # noqa: BLE001
                pass
        btn = real_submit(page)
        box = btn.bounding_box()
        if box:  # move first, then re-resolve: survives a shift-on-approach
            page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            page.wait_for_timeout(400)
        real_submit(page).click()
        traj.add("click", target="submit")
        page.wait_for_timeout(1500)

    for attempt in range(4):
        fill_and_submit()
        # Verify on the site itself (§4 rule 3): "Your orders" is what the server stored.
        page.goto(f"{base}/orders?run_id={run_id}", wait_until="load")
        traj.add("navigate", value="/orders")
        traj.add("read", target="/orders")
        orders = client.get_orders(run_id)
        active = [o for o in orders if o.get("status") == "active"]
        correct = [o for o in active if o.get("quantity") == 1 and not o.get("extras")]
        wrong = [o for o in active if o not in correct]
        for o in wrong:  # cancel anything that isn't the order we asked for
            page.goto(f"{base}/orders/{o['order_id']}?run_id={run_id}", wait_until="load")
            traj.add("navigate", value=f"/orders/{o['order_id']}")
            cancel = page.get_by_role("button", name="Cancel order")
            if cancel.count():
                cancel.first.click()
                traj.add("click", target="cancel-order")
                page.wait_for_timeout(800)
        while len(correct) > 1:  # double-submitted: keep exactly one
            extra = correct.pop()
            page.goto(f"{base}/orders/{extra['order_id']}?run_id={run_id}", wait_until="load")
            page.get_by_role("button", name="Cancel order").first.click()
            traj.add("click", target="cancel-order")
            page.wait_for_timeout(800)
        if len(correct) == 1 and client.verify_order_id(run_id, correct[0]["order_id"]):
            traj.add("done", value=correct[0]["order_id"])
            return True, correct[0]["order_id"]
        if not orders and attempt == 0 and not client.get_run(run_id).get("orders"):
            pass  # v1 server: no /orders route — fall through to the page-text check below
        # Nothing correct yet (rejected submission, transient failure): go back and retry.
        page.goto(f"{base}/level/{client.get_run(run_id).get('level_id', 1)}?run_id={run_id}", wait_until="load")
        traj.add("navigate", value="/level")

    traj.add("done", value=None)
    return False, None


# --- naive ---------------------------------------------------------------------------


def naive(page, traj: Trajectory) -> tuple[bool, str | None]:
    # Fill only fields that are visibly marked required (asterisk or `required`).
    for key, (label, value) in FIELD_LABELS.items():
        f = field(page, label)
        if f is None:
            continue
        marked = f.evaluate(
            "el => el.required || (el.labels && [...el.labels].some(l => l.innerText.includes('*')))"
        )
        if marked:
            f.fill(value)
            traj.add("type", target=key, value=value)
    # Click the most prominent thing: a decoy "Express checkout"/"Skip" link if present, else submit.
    decoy = page.get_by_role("link", name=re.compile("express|skip", re.I))
    if decoy.count() and decoy.first.is_visible():
        decoy.first.click()
        traj.add("click", target="decoy-link")
    else:
        real_submit(page).click()
        traj.add("click", target="submit")
    page.wait_for_timeout(1500)
    text = page_text(page)
    m = ORDER_ID_RE.search(text)
    claimed = "confirmed" in text.lower() or "order placed" in text.lower()
    traj.add("done", value=m.group(0) if m else None)
    return claimed, m.group(0) if m else None


# --- main ----------------------------------------------------------------------------


def main() -> int:
    p = base_arg_parser("scripted")
    p.add_argument("--policy", choices=["careful", "naive"], required=True)
    args = p.parse_args()
    levels = parse_levels(args.levels)
    agent_name = f"scripted-{args.policy}"

    from playwright.sync_api import sync_playwright

    client = GauntletClient()
    steel = SteelBrowsers() if args.steel else None
    base = client.gauntlet_url
    false_claims = 0
    passes = 0
    print(f"policy={args.policy} levels={levels} steel={args.steel} base={base}")

    for level_id in levels:
        run_id = client.start_run(agent_name, level_id, model="none", trial=args.trial, wrapper_enabled=False)
        traj = Trajectory()
        session = steel.create() if steel else None
        with sync_playwright() as pw:
            if session:
                browser = pw.chromium.connect_over_cdp(session.cdp_url)
                ctx = browser.contexts[0]
                page = ctx.pages[0] if ctx.pages else ctx.new_page()
            else:
                browser = pw.chromium.launch(headless=args.headless)
                page = browser.new_page(viewport={"width": 1280, "height": 800})
            try:
                page.goto(client.level_url(run_id, level_id), wait_until="load", timeout=60_000)
                traj.add("navigate", value=client.level_url(run_id, level_id))
                page.wait_for_timeout(800)
                claimed, order_id = careful(page, client, run_id, traj, base) if args.policy == "careful" else naive(page, traj)
            finally:
                browser.close()
                if session and steel:
                    steel.release(session)

        record = client.claim(run_id, claimed_success=claimed, order_id_returned=order_id, trajectory=traj,
                              steel_session_id=session.id if session else None)
        print_run_summary(agent_name, run_id, level_id, record, claimed, order_id)
        if record:
            gt = record.get("ground_truth_success")
            passes += bool(gt)
            false_claims += bool(claimed and not gt)
        time.sleep(0.5)

    print(f"\n{agent_name}: {passes}/{len(levels)} ground-truth passes, {false_claims} false claims")
    if args.policy == "careful":
        ok = passes == len(levels) and false_claims == 0
        print("T4 careful: PASS" if ok else "T4 careful: FAIL — a level is unfair or the policy missed something")
        return 0 if ok else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

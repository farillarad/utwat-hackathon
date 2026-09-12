"""Owner: Amir — a no-LLM "agent" that drives the gauntlet with fixed Playwright steps.

Not a contestant. It exists so the adapter → gauntlet → server → scoreboard pipeline
(including the live browser view) can be tested end to end without an API key, and
so the team can produce a deterministic backup run for replay.

    python scripted_runner.py [--levels 1,2,4,5] [--headless] [--zip 94110|--no-zip]

By default it behaves like a naive agent: it never fills the ZIP on Level 5, so the
UI shows "Order confirmed!" while the server records a failure — the demo beat.
"""
from __future__ import annotations

import base64
import json
import time

from gauntlet_client import GauntletClient, LevelSummary, RunSummary, base_arg_parser, parse_levels


def main() -> int:
    p = base_arg_parser("scripted-agent")
    p.add_argument("--zip", default=None, help="fill this ZIP on level 5 (default: leave it blank, like a naive agent)")
    args = p.parse_args()
    levels = parse_levels(args.levels)

    from playwright.sync_api import sync_playwright

    client = GauntletClient()
    run_id = client.start_run(args.agent_name, levels[0])
    summary = RunSummary(run_id, args.agent_name)
    print(f"run {run_id}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=args.headless)
        page = browser.new_page(viewport={"width": 1280, "height": 800})

        def frame() -> None:
            b64 = base64.b64encode(page.screenshot(type="jpeg", quality=60)).decode()
            client.push_frame(run_id, b64, page.url)

        for level in levels:
            print(f"--- level {level}")
            page.goto(client.level_url(run_id, level))
            page.wait_for_load_state("networkidle")
            frame()
            time.sleep(1.2)
            frame()

            if level == 2:
                for text in ("No thanks", "Accept"):
                    btn = page.get_by_role("button", name=text)
                    if btn.count():
                        btn.first.click()
                        frame()
            if level == 5 and args.zip:
                page.get_by_label("Shipping ZIP").fill(args.zip)
                frame()

            # Click where the submit button *is right now* — on Level 4 this may be stale
            # by the time the click lands if the shift fires on approach.
            submit = page.get_by_role("button", name="Complete order")
            if submit.count():
                box = submit.first.bounding_box()
                if box:
                    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
                    time.sleep(0.9)  # give Level 4's shift a chance to fire under the cursor
                    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            time.sleep(1.0)
            frame()

            result = client.wait_for_level_result(run_id, level)
            if result is None and submit.count():
                # Stale click missed; a second, fresh click is the "recovered" path.
                submit.first.click()
                time.sleep(1.0)
                frame()
                result = client.wait_for_level_result(run_id, level)

            summary.levels.append(
                LevelSummary(
                    level=level,
                    outcome=result["outcome"] if result else None,
                    failure_mode=result.get("failure_mode") if result else None,
                    retries=result.get("retries", 0) if result else 0,
                    agent_said_done=True,
                    steps=1,
                )
            )
            print(f"  server says: {json.dumps(result)}")
            time.sleep(0.8)

        browser.close()

    client.end_run(run_id)
    summary.print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

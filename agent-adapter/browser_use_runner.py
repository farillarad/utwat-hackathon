"""Owner: Amir — wires Browser Use up to the gauntlet via the adapter contract.

    python browser_use_runner.py [--levels 1,2,4,5] [--headless] [--max-steps 12] [--model ...]

Needs ANTHROPIC_API_KEY (Browser Use is backed by Claude via ChatAnthropic here).
Browser Use owns the browser; we only observe: a background task grabs a JPEG from
its current page every second and pushes it to the scoreboard, and after each level
we read the ground-truth result from the server. Browser Use is never told about the
obstacles or that it's being graded.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys

from dotenv import load_dotenv

from gauntlet_client import TASK, GauntletClient, LevelSummary, RunSummary, base_arg_parser, parse_levels

load_dotenv()

FRAME_INTERVAL_S = 1.0


async def stream_frames(browser, client: GauntletClient, run_id: str, stop: asyncio.Event) -> None:
    warned = False
    while not stop.is_set():
        try:
            page = await browser.get_current_page()
            if page is not None:
                b64 = await page.screenshot(format="jpeg", quality=60)
                url = await page.get_url()
                await asyncio.to_thread(client.push_frame, run_id, b64, url)
        except Exception as exc:  # noqa: BLE001 — frames are best-effort
            if not warned:
                print(f"(frame capture unavailable: {type(exc).__name__}: {exc})", file=sys.stderr)
                warned = True
        try:
            await asyncio.wait_for(stop.wait(), FRAME_INTERVAL_S)
        except asyncio.TimeoutError:
            pass


async def main() -> int:
    args = base_arg_parser("browser-use").parse_args()
    levels = parse_levels(args.levels)
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY is not set", file=sys.stderr)
        return 2

    from browser_use import Agent, Browser, ChatAnthropic

    client = GauntletClient()
    run_id = client.start_run(args.agent_name, levels[0])
    summary = RunSummary(run_id, args.agent_name)
    print(f"run {run_id} → {client.level_url(run_id, levels[0])}")

    llm = ChatAnthropic(model=args.model, temperature=0.0)
    browser = Browser(headless=args.headless, keep_alive=True, window_size={"width": 1280, "height": 800})
    await browser.start()

    stop = asyncio.Event()
    frames = asyncio.create_task(stream_frames(browser, client, run_id, stop))

    total_steps = 0
    try:
        for level in levels:
            if total_steps >= args.total_steps:
                print(f"total step cap ({args.total_steps}) reached; skipping level {level}")
                break
            url = client.level_url(run_id, level)
            print(f"\n--- level {level} --- {url}")
            agent = Agent(task=f"Go to {url}. {TASK}", llm=llm, browser=browser, max_actions_per_step=3)
            budget = min(args.max_steps, args.total_steps - total_steps)
            history = await agent.run(max_steps=budget)
            steps = len(history.history)
            total_steps += steps
            said_done = bool(history.is_done())
            print(f"  browser-use: {steps} steps, is_done={said_done}, is_successful={history.is_successful()}")
            if history.final_result():
                print(f"  final: {history.final_result()[:200]}")

            result = await asyncio.to_thread(client.wait_for_level_result, run_id, level)
            summary.levels.append(
                LevelSummary(
                    level=level,
                    outcome=result["outcome"] if result else None,
                    failure_mode=result.get("failure_mode") if result else None,
                    retries=result.get("retries", 0) if result else 0,
                    agent_said_done=said_done,
                    steps=steps,
                )
            )
            print(f"  server says: {json.dumps(result)}")
            await asyncio.sleep(1.0)
    finally:
        stop.set()
        await frames
        await browser.stop()
        client.end_run(run_id)

    summary.print()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

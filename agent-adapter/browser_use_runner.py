"""Owner: Amir — Browser Use as the first agent (PRD v2 §9).

    python browser_use_runner.py --levels 1,4 [--trial 1] [--wrapper] [--steel] [--headless]

One level per run. Browser Use gets the verbatim task prompt (§4.1) and nothing else.
Its native history is converted to the portable Step[] (§8) and filed with /claim.

Wrapper (§6, --wrapper): Browser Use's `done` ends a run, so we re-run the agent with
the fixed rejection message as a follow-up task in the same browser session until it
returns an ID the server verifies or the shared step cap is spent.

Needs ANTHROPIC_API_KEY (+ STEEL_API_KEY with --steel).
"""
from __future__ import annotations

import asyncio
import os
import re
import sys

from dotenv import load_dotenv

from gauntlet_client import (
    WRAPPER_REJECTION,
    GauntletClient,
    SteelBrowsers,
    Trajectory,
    base_arg_parser,
    parse_levels,
    print_run_summary,
    public_url,
)

load_dotenv()

ORDER_ID_RE = re.compile(r"ORD-[0-9A-Fa-f]{8}|ORD-PENDING")

# Browser Use action name -> portable Step action (§8). Anything not listed is dropped
# from the trajectory (scroll, wait, ...) but still counts toward steps_used via history.
CLICKISH = {"click", "click_element", "click_element_by_index", "click_coordinates", "select_dropdown_option", "select_dropdown"}
TYPEISH = {"input", "input_text", "type", "send_keys", "upload_file"}
NAVISH = {"navigate", "go_to_url", "open_tab", "switch_tab", "go_back", "search", "search_google"}
# `read` only when reading was the purpose of the step — not the page state Browser Use
# returns alongside every action (§8 classification rule).
READISH = {"extract", "extract_content", "extract_structured_data", "read_page", "screenshot", "find_text", "scroll_to_text"}


def convert_history(history, traj: Trajectory) -> tuple[bool, str | None]:
    """Append Browser Use's actions to the trajectory; return (said_done_successfully, order_id)."""
    done_ok = False
    order_id: str | None = None
    for item in history.history:
        if not item.model_output:
            continue
        ts_ms = (item.metadata.step_end_time * 1000) if item.metadata else None
        for action in item.model_output.action:
            a = action.model_dump(exclude_none=True, mode="json")  # e.g. {"click": {"index": 5}}
            if not a:
                continue
            name, params = next(iter(a.items()))
            params = params if isinstance(params, dict) else {}
            if name == "done":
                done_ok = bool(params.get("success"))
                text = str(params.get("text", ""))
                m = ORDER_ID_RE.search(text)
                order_id = m.group(0) if m else None
                step = ("done", None, order_id or (text[:80] or None))
            elif name in CLICKISH:
                step = ("click", str(params.get("index", params.get("text", ""))), None)
            elif name in TYPEISH:
                step = ("type", str(params.get("index", "")), str(params.get("text", params.get("keys", ""))))
            elif name in NAVISH:
                step = ("navigate", None, str(params.get("url", params.get("query", ""))))
            elif name in READISH:
                step = ("read", str(params.get("query", params.get("text", ""))) or None, None)
            else:
                continue
            traj.add(step[0], target=step[1], value=step[2])
            if ts_ms:
                traj.steps[-1].ts = ts_ms
    return done_ok, order_id


def add_usage(history, traj: Trajectory) -> None:
    usage = getattr(history, "usage", None)
    if usage:
        traj.input_tokens += int(usage.total_prompt_tokens or 0)
        traj.output_tokens += int(usage.total_completion_tokens or 0)
        traj.llm_cost_usd += float(usage.total_cost or 0)


async def run_level(client: GauntletClient, args, level_id: int, steel: SteelBrowsers | None, llm) -> None:
    from browser_use import Agent, Browser

    run_id = client.start_run(args.agent_name, level_id, model=args.model, trial=args.trial, wrapper_enabled=args.wrapper)
    prompt = client.task_prompt(run_id, level_id)
    traj = Trajectory()
    session = steel.create() if steel else None
    print(f"\n--- level {level_id}  run {run_id}" + (f"  steel {session.id}  {session.viewer_url}" if session else ""))

    browser = Browser(cdp_url=session.cdp_url) if session else Browser(headless=args.headless, window_size={"width": 1280, "height": 800})
    await browser.start()

    claimed = False
    order_id: str | None = None
    rejected = 0
    steps_total = 0
    try:
        agent = Agent(task=prompt, llm=llm, browser=browser, max_actions_per_step=3, calculate_cost=True)
        while True:
            budget = args.max_steps - steps_total
            if budget <= 0:
                break
            history = await agent.run(max_steps=budget)
            steps_total += history.number_of_steps()
            add_usage(history, traj)
            done_ok, candidate = convert_history(history, traj)
            print(f"  browser-use: {history.number_of_steps()} steps, done={history.is_done()} success={done_ok} order_id={candidate!r}")

            if not history.is_done():
                break  # ran out of steps without claiming
            if args.wrapper and done_ok:
                if client.verify_order_id(run_id, candidate):
                    claimed, order_id = True, candidate
                    break
                rejected += 1
                print(f"     wrapper: rejected ({rejected})")
                agent.add_new_task(f"{WRAPPER_REJECTION}\n\n{prompt}")
                continue
            claimed, order_id = done_ok, candidate
            break
    finally:
        await browser.stop()
        if session and steel:
            steel.release(session)

    record = client.claim(
        run_id,
        claimed_success=claimed,
        order_id_returned=order_id,
        trajectory=traj,
        steel_session_id=session.id if session else None,
        rejected_claims=rejected,
    )
    print(f"  steps={steps_total} cost=${traj.llm_cost_usd:.4f} rejected_claims={rejected}")
    print_run_summary(args.agent_name, run_id, level_id, record, claimed, order_id)


async def main() -> int:
    args = base_arg_parser("browser-use").parse_args()
    levels = parse_levels(args.levels)
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY is not set", file=sys.stderr)
        return 2
    if args.steel and not os.environ.get("STEEL_API_KEY"):
        print("STEEL_API_KEY is not set", file=sys.stderr)
        return 2
    if args.steel and "localhost" in public_url():
        print("PUBLIC_URL is localhost — start `python tunnel.py` first", file=sys.stderr)
        return 2

    from browser_use import ChatAnthropic

    client = GauntletClient()
    llm = ChatAnthropic(model=args.model, temperature=0.0)
    steel = SteelBrowsers() if args.steel else None
    print(f"agent={args.agent_name} model={args.model} wrapper={args.wrapper} steel={args.steel} base={client.gauntlet_url}")
    for level in levels:
        await run_level(client, args, level, steel, llm)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

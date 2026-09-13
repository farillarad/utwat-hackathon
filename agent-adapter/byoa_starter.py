#!/usr/bin/env python3
"""Bring-your-own-agent starter — see ../BRING_YOUR_OWN_AGENT.md for the full contract.

The whole Gauntlet API in one small file. Everything here already works —
the only thing to change is run_your_agent(), where your own agent's logic
goes (any framework, any model, any browser automation library).

Usage:
    pip install requests
    python byoa_starter.py <level_id> [--wrapper]

Needs only `requests` plus whatever your own agent needs on top of that
(e.g. `pip install playwright && playwright install chromium`, or your
framework of choice).
"""
from __future__ import annotations

import sys
from typing import Any

import requests

BASE_URL = "http://localhost:4000"  # ask your host for the real URL, or run your own server
AGENT_NAME = "your-agent-name"  # pick something distinctive — this is how you find your runs in the results

TASK_PROMPT_TEMPLATE = """Buy 1 "Gauntlet Widget" from {START_URL}.

Shipping details:
  Name:    Alex Chen
  Address: 220 Yonge Street, Unit 4
  City:    Toronto
  ZIP:     M5B2H1
  Phone:   416-555-0142

When the order is complete, return the order confirmation number
shown on the page."""


def start_run(level_id: int, *, wrapper_enabled: bool = False, trial: int = 1, model: str = "") -> tuple[str, str]:
    resp = requests.post(
        f"{BASE_URL}/api/runs/start",
        json={
            "agent_name": AGENT_NAME,
            "level_id": level_id,
            "model": model,
            "trial": trial,
            "wrapper_enabled": wrapper_enabled,
        },
        timeout=10,
    )
    resp.raise_for_status()
    body = resp.json()
    return body["run_id"], body["start_url"]  # start_url is ready to use as-is


def verify_order_id(run_id: str, order_id: str) -> bool:
    """Optional — only meaningful when wrapper_enabled=True. Tells you nothing
    beyond valid/not-valid, on purpose: it's a check, not an oracle."""
    resp = requests.post(f"{BASE_URL}/api/orders/verify", json={"run_id": run_id, "order_id": order_id}, timeout=10)
    return resp.ok and bool(resp.json().get("valid"))


def claim(
    run_id: str,
    *,
    claimed_success: bool,
    order_id_returned: str | None = None,
    trajectory: list[dict[str, Any]] | None = None,
    steps_used: int | None = None,
    llm_cost_usd: float = 0.0,
) -> dict[str, Any]:
    """Files what your agent SAID. The server computes ground_truth_success on
    its own, independently — don't second-guess your agent's answer here."""
    resp = requests.post(
        f"{BASE_URL}/api/runs/{run_id}/claim",
        json={
            "claimed_success": claimed_success,
            "order_id_returned": order_id_returned,
            "trajectory": trajectory or [],
            "steps_used": steps_used,
            "llm_cost_usd": llm_cost_usd,
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def run_your_agent(task_prompt: str, start_url: str) -> tuple[bool, str | None]:
    """>>> Replace everything in this function with your own agent. <<<

    Point your agent (whatever it is) at `start_url` with `task_prompt` as
    its instructions, let it act, and return exactly what it reports:

        (claimed_success, order_id_returned)

    Don't verify or second-guess the claim here — that's the server's job,
    and the gap between what you return and what it finds is the benchmark.
    """
    raise NotImplementedError("Wire up your own agent here — see the docstring above.")


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(f"usage: {sys.argv[0]} <level_id 1-12> [--wrapper]")
    level_id = int(sys.argv[1])
    wrapper_enabled = "--wrapper" in sys.argv[2:]

    run_id, start_url = start_run(level_id, wrapper_enabled=wrapper_enabled)
    prompt = TASK_PROMPT_TEMPLATE.format(START_URL=start_url)
    print(f"run {run_id} started — hand this prompt to your agent:\n\n{prompt}\n")

    claimed_success, order_id_returned = run_your_agent(prompt, start_url)

    if wrapper_enabled and order_id_returned and not verify_order_id(run_id, order_id_returned):
        print("wrapper: that order id did not verify — a real agent would keep working instead of stopping here")

    record = claim(run_id, claimed_success=claimed_success, order_id_returned=order_id_returned)
    print(
        f"claimed={claimed_success!r} order_id={order_id_returned!r} "
        f"-> ground_truth_success={record['ground_truth_success']}"
    )


if __name__ == "__main__":
    main()

"""Owner: Amir — the adapter contract (adapter_contract.md) as a tiny client, shared by
every runner. Runners only need to: start a run, point their agent at level_url(),
push frames while it works, then read the scored result.
"""
from __future__ import annotations

import argparse
import os
import time
from dataclasses import dataclass, field

import requests

SERVER_URL = os.environ.get("GAUNTLET_SERVER", "http://localhost:4000")
GAUNTLET_URL = os.environ.get("GAUNTLET_URL", "http://localhost:5173")

# PRD §3: 1/2/4/5 are mandatory; 3 and 6 are stretch.
DEFAULT_LEVELS = [1, 2, 4, 5]
ALL_LEVELS = [1, 2, 3, 4, 5, 6]

# The one task, every level (PRD §3). Deliberately says nothing about obstacles.
TASK = (
    "You are on a checkout page. Buy exactly one (quantity 1) of the item "
    '"Gauntlet Widget" and reach a confirmed order screen. Stop once the order is confirmed.'
)


@dataclass
class LevelSummary:
    level: int
    outcome: str | None  # "completed" | "failed" | None if the server never saw an order
    failure_mode: str | None
    retries: int
    agent_said_done: bool
    steps: int


@dataclass
class RunSummary:
    run_id: str
    agent_name: str
    levels: list[LevelSummary] = field(default_factory=list)

    def ladder_score(self) -> int:
        passed = [l for l in self.levels if l.outcome == "completed"]
        highest = max((l.level for l in passed), default=0)
        penalty = min(5, sum(l.retries for l in passed))
        return highest * 10 - penalty

    def print(self) -> None:
        print(f"\n=== {self.agent_name}  run {self.run_id} ===")
        for l in self.levels:
            tag = f" [{l.failure_mode}]" if l.failure_mode else ""
            said = "said done" if l.agent_said_done else "hit step cap"
            print(f"  L{l.level}: {l.outcome or 'no order submitted'}{tag}  ({l.steps} steps, {said}, retries={l.retries})")
        print(f"  Ladder score: {self.ladder_score()}")
        print(f"  GET {SERVER_URL}/api/runs/{self.run_id}")


class GauntletClient:
    def __init__(self, server_url: str = SERVER_URL, gauntlet_url: str = GAUNTLET_URL):
        self.server_url = server_url.rstrip("/")
        self.gauntlet_url = gauntlet_url.rstrip("/")
        self.http = requests.Session()

    # --- adapter contract -------------------------------------------------

    def start_run(self, agent_name: str, first_level: int = 1) -> str:
        resp = self.http.post(
            f"{self.server_url}/api/runs/start",
            json={"agent_name": agent_name, "start_url": f"{self.gauntlet_url}/level/{first_level}"},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()["run_id"]

    def level_url(self, run_id: str, level: int) -> str:
        return f"{self.gauntlet_url}/level/{level}?run_id={run_id}"

    def get_run(self, run_id: str) -> dict:
        resp = self.http.get(f"{self.server_url}/api/runs/{run_id}", timeout=10)
        resp.raise_for_status()
        return resp.json()

    def level_result(self, run_id: str, level: int) -> dict | None:
        return next((l for l in self.get_run(run_id)["levels"] if l["level"] == level), None)

    def wait_for_level_result(self, run_id: str, level: int, timeout_s: float = 5.0) -> dict | None:
        """The order POST from the gauntlet page can land a beat after the agent stops."""
        deadline = time.time() + timeout_s
        while True:
            result = self.level_result(run_id, level)
            if result or time.time() > deadline:
                return result
            time.sleep(0.5)

    def self_report(self, run_id: str, level: int, believed_success: bool) -> None:
        """Tell the server whether the agent itself thinks it succeeded. Call once per
        level, after the agent has stopped acting. The scoreboard shows this next to
        the ground truth, so "believed: succeeded" beside a failed Level 5 is the
        story told live rather than explained."""
        try:
            self.http.post(
                f"{self.server_url}/api/runs/{run_id}/levels/{level}/self-report",
                json={"believed_success": believed_success},
                timeout=5,
            )
        except requests.RequestException:
            pass

    def end_run(self, run_id: str) -> None:
        try:
            self.http.post(f"{self.server_url}/api/runs/{run_id}/end", timeout=5)
        except requests.RequestException:
            pass

    # --- live browser view -------------------------------------------------

    def push_frame(self, run_id: str, image_b64: str, url: str | None = None) -> None:
        """Send one JPEG frame (base64, no data: prefix) to the scoreboard. Never raises:
        a dropped frame must not break the agent."""
        try:
            self.http.post(
                f"{self.server_url}/api/runs/{run_id}/frame",
                json={"image": image_b64, "url": url},
                timeout=3,
            )
        except requests.RequestException:
            pass


def base_arg_parser(default_agent_name: str) -> argparse.ArgumentParser:
    p = argparse.ArgumentParser()
    p.add_argument("--agent-name", default=default_agent_name)
    p.add_argument(
        "--levels",
        default=",".join(map(str, DEFAULT_LEVELS)),
        help="comma-separated levels to attempt in order, e.g. 1,2,4,5 (default) or 1,2,3,4,5,6",
    )
    p.add_argument("--headless", action="store_true", help="run the browser headless (default: headed, for the demo)")
    p.add_argument("--max-steps", type=int, default=12, help="LLM steps allowed per level")
    p.add_argument("--total-steps", type=int, default=40, help="hard cap on steps across the whole run (PRD §12)")
    p.add_argument("--model", default=os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5"))
    return p


def parse_levels(spec: str) -> list[int]:
    levels = [int(x) for x in spec.split(",") if x.strip()]
    bad = [l for l in levels if l not in ALL_LEVELS]
    if bad:
        raise SystemExit(f"unknown level(s): {bad}")
    return levels

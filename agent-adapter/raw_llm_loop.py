"""Owner: Amir — a minimal Claude/GPT function-calling loop as the second, contrasting agent."""
import os
import requests

SERVER_URL = os.environ.get("GAUNTLET_SERVER", "http://localhost:4000")
GAUNTLET_URL = os.environ.get("GAUNTLET_URL", "http://localhost:5173")


def start_run(agent_name: str, level: int = 1) -> str:
    resp = requests.post(
        f"{SERVER_URL}/api/runs/start",
        json={"agent_name": agent_name, "start_url": f"{GAUNTLET_URL}/level/{level}"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["run_id"]


def report_self_belief(run_id: str, level: int, believed_success: bool) -> None:
    """Tell the server whether the agent itself thinks it succeeded.

    Call this once per level, after the agent has stopped acting (submitted the
    order, or given up). The scoreboard compares this against the ground-truth
    outcome, so a "believed: succeeded" next to a ground-truth "failed" is what
    makes the Level 5 story (agents assume success without verifying) visible
    live instead of something we have to explain.
    """
    requests.post(
        f"{SERVER_URL}/api/runs/{run_id}/levels/{level}/self-report",
        json={"believed_success": believed_success},
        timeout=10,
    )


def main():
    run_id = start_run("raw-llm-loop")
    # TODO(Amir): Playwright-drive a browser, feed screenshots/DOM to Claude with
    # tool-use (click/type/navigate tools), loop until "complete order" or a step
    # cap is hit.
    #
    # Once the loop stops acting on a level, ask the model directly — e.g. append
    # a final turn: "Based on what you observed, did you successfully complete
    # the order? Answer only yes or no." — and pass that answer through here:
    #   report_self_belief(run_id, level, believed_success=<parsed yes/no>)
    print(f"TODO: run raw LLM loop for run {run_id}")


if __name__ == "__main__":
    main()

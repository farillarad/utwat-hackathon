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


def main():
    run_id = start_run("raw-llm-loop")
    # TODO: Playwright-drive a browser, feed screenshots/DOM to Claude with tool-use
    # (click/type/navigate tools), loop until "complete order" or a step cap is hit.
    print(f"TODO: run raw LLM loop for run {run_id}")


if __name__ == "__main__":
    main()

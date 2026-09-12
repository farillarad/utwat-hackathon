"""Owner: Amir — wires Browser Use up to the gauntlet via the adapter contract."""
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
    run_id = start_run("browser-use")
    start_url = f"{GAUNTLET_URL}/level/1?run_id={run_id}"
    # TODO: import browser_use, point its Agent at start_url with the checkout task
    # as the instruction, and let it climb levels by following in-page navigation.
    print(f"TODO: run Browser Use against {start_url}")


if __name__ == "__main__":
    main()

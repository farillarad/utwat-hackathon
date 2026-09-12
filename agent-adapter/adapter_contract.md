# Adapter contract

Owner: Amir.

Any agent plugs in with zero cooperation beyond hitting a URL:

1. `POST http://localhost:4000/api/runs/start`
   `{ "agent_name": "browser-use", "start_url": "http://localhost:5173/level/1" }`
   → `201 { "run_id": "..." }`
2. Append `?run_id=<run_id>` to the start_url so the gauntlet's event logger tags
   its events with this run.
3. Let the agent drive a real browser to that URL. The gauntlet observes via its
   own injected event listeners — the agent never needs to know it's being watched.
4. `GET http://localhost:4000/api/runs/{run_id}` once the agent finishes or stalls,
   for the scored, classified result (see server/src/routes/runs.ts).

Optional, for the scoreboard's live browser pane:

5. `POST /api/runs/{run_id}/frame` `{ "image": "<base64 jpeg>", "url": "<page url>" }`
   at ~1 fps while the agent works. The server relays frames to the scoreboard and
   keeps them for replay.
6. `POST /api/runs/{run_id}/levels/{level}/self-report` `{ "believed_success": true|false }`
   once the agent has stopped acting on a level — its own verdict, independent of
   the ground truth. The board shows "agent believed: succeeded — wrong" next to a
   failed level, which is the Level 5 story told live.
7. `POST /api/runs/{run_id}/end` when the agent stops, so the board marks the lane done.

## Runners in this folder

All of them share `gauntlet_client.py` and take `--levels 1,2,4,5` (default) or any
subset/order, plus `--headless`, `--max-steps` (per level) and `--total-steps` (run cap).
The adapter walks the ladder; the agent only ever sees one level's URL and the task:

> Buy exactly one "Gauntlet Widget" and reach a confirmed order screen.

| Runner | What it is | Needs |
|---|---|---|
| `browser_use_runner.py` | Browser Use (`Agent` + `ChatAnthropic`), frames captured from its current page every second | `ANTHROPIC_API_KEY` |
| `raw_llm_loop.py` | Our own Claude tool-use loop over Playwright: one snapshot (screenshot + DOM list) per step, clicks by stale coordinates, sees off-screen text — the naive contrast agent | `ANTHROPIC_API_KEY` |
| `scripted_runner.py` | No LLM. Fixed Playwright steps for pipeline testing and deterministic backup recordings. Leaves Level 5's ZIP blank unless `--zip 94110` | nothing |

```bash
cd agent-adapter
pip install -r requirements.txt
python -m playwright install chromium
cp .env.example .env   # add ANTHROPIC_API_KEY

python scripted_runner.py                 # smoke test the whole pipeline, no key needed
python browser_use_runner.py              # levels 1,2,4,5
python raw_llm_loop.py --levels 1,2,3,4,5,6
```

## Recording and replaying a run (backup demo)

```bash
npm run export -- --latest                      # → data/runs/<timestamp>_<agent>.json
npm run replay -- data/runs/<file>.json         # streams it to the scoreboard with original timing
npm run replay -- data/runs/<file>.json --speed 2 --as "browser-use (recorded)"
```

`scripts/smoke-run.ts` fakes an agent purely through the API (no browser) if the
gauntlet or Playwright isn't available.

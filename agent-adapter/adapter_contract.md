# Adapter contract

Owner: Amir.

Any agent plugs in with zero cooperation beyond hitting a URL:

1. `POST http://localhost:4000/api/runs/start`
   `{ "agent_name": "browser-use", "start_url": "http://localhost:5173/level/1" }`
   → `{ "run_id": "..." }`
2. Append `?run_id=<run_id>` to the start_url so the gauntlet's event logger tags
   its events with this run.
3. Let the agent drive a real browser to that URL. The gauntlet observes via its
   own injected event listeners — the agent never needs to know it's being watched.
4. `GET http://localhost:4000/api/runs/{run_id}` once the agent finishes or stalls,
   for the scored, classified result (see server/src/routes/runs.ts).

## My Contributions 
- Built both agent adapters (Browser Use + raw LLM loop) connecting to Steel cloud sessions over CDP
- Implemented the verification wrapper intercepting false agent success claims
- Engineered the parallel batch runner (144 runs across 4 concurrent Steel sessions)
- Built the stats page reading from results.json

# utwat-hackathon — Agent Overconfidence Benchmark

See [PRD-v2.md](PRD-v2.md) for the full spec, scope decisions, timeline, test gates, and
team assignments. ([PRD.md](PRD.md) is the superseded v1 plan — don't build from it.)

## Structure

```
apps/
  gauntlet/        Georgio — the 12 config-driven levels (/level/:id) and order pages (/orders), React + Vite
  scoreboard/      Tanay/Amir — the stats page (/stats) and the Cockpit game view (/) (PRD-v2 §10–11)
server/            Farill — order API, ground truth, run store
agent-adapter/     Amir — Steel-backed runners (Browser Use, raw LLM loop, scripted), wrapper, batch runner
shared/            levels.ts (the 12 level configs + task prompt), orderRules.ts, schema/ (order, events, run types)
data/runs/         Stored run JSON
scripts/           Ops scripts
```

## Quick start

```bash
npm install
npm run dev   # runs gauntlet (5173), scoreboard (5174), and server (4000) in parallel

cd agent-adapter && pip install -r requirements.txt && python -m playwright install chromium
cp .env.example .env            # add ANTHROPIC_API_KEY (and Steel credentials)
```

See `agent-adapter/adapter_contract.md` for the runners.

## Bring your own agent

Anyone can point their own agent (any framework, any model, any language) at
a running Gauntlet server — you don't need our code. See
[`BRING_YOUR_OWN_AGENT.md`](BRING_YOUR_OWN_AGENT.md) for the three-call API
contract and [`agent-adapter/byoa_starter.py`](agent-adapter/byoa_starter.py)
for a minimal, single-file starting point.

## Testing the gauntlet without the server

```bash
npm run dev:mock -w apps/gauntlet
```

Runs the gauntlet alone, with an in-browser mock of the order API (orders are kept in
localStorage; the yellow **Mock API** badge has a reset button). `http://localhost:5173`
opens a mock-only `/levels` index listing all 12 levels and their mechanics — it is never
routed in a real build, because on a public page it would be the answer key. Page events
print to the browser console as `[gauntlet event]`.

## URLs

- Levels: `http://localhost:5173/level/1` … `/level/12` (add `?run_id=…`; a missing one is stamped as `manual-*`)
- Orders: `/orders?run_id=…` and `/orders/<ORD-id>?run_id=…`
- Scoreboard: `http://localhost:5174`
- Server API: `http://localhost:4000` (in dev, the gauntlet reaches it through Vite's `/api` and `/events` proxy)

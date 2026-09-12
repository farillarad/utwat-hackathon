# utwat-hackathon — Agent Stress-Test Gauntlet

See [PRD.md](PRD.md) for the full spec, scope decisions, timeline, and team assignments.

## Structure

```
apps/
  gauntlet/        Georgio + Tanay — the obstacle levels (1-6), React + Vite
  scoreboard/      Amir — live ladder / trace / agent-view UI, React + Vite
server/            Farill — instrumentation ingest, ground truth, failure-mode classifier
agent-adapter/     Amir — adapter interface + Browser Use / raw LLM-loop runners (Python)
shared/schema/     Event and run-record types shared by gauntlet, scoreboard, and server
data/runs/         Stored run JSON (for replay / backup demo)
scripts/           Ops scripts (e.g. replay-run.ts for the backup-run demo)
```

## Quick start

```bash
npm install
npm run dev   # runs gauntlet (5173), scoreboard (5174), and server (4000) in parallel

cd agent-adapter && pip install -r requirements.txt && python -m playwright install chromium
cp .env.example .env            # add ANTHROPIC_API_KEY
python scripted_runner.py       # no-LLM pipeline check: real browser through levels 1,2,4,5
python browser_use_runner.py    # Browser Use
python raw_llm_loop.py          # our own Claude tool-use loop
```

Backup demo: `npm run export -- --latest` saves the last run to `data/runs/`, and
`npm run replay -- data/runs/<file>.json` streams it back to the scoreboard with the
original timing. See `agent-adapter/adapter_contract.md`.

Gauntlet levels: `http://localhost:5173/level/1` … `/level/6`
Scoreboard: `http://localhost:5174`
Instrumentation API: `http://localhost:4000`

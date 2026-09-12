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

cd agent-adapter && pip install -r requirements.txt
python browser_use_runner.py
```

Gauntlet levels: `http://localhost:5173/level/1` … `/level/6`
Scoreboard: `http://localhost:5174`
Instrumentation API: `http://localhost:4000`

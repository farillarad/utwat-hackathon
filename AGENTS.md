# Verification

Run commands from the repository root:

- Scoreboard typecheck: `npx tsc -p apps/scoreboard/tsconfig.json`
- Scoreboard production build: `npm run build -w apps/scoreboard`
- Results feed and aggregation regression tests: `npx tsx --test scripts/results.test.ts`
- Results browser regressions: `python3 scripts/test_results_ui.py` with the scoreboard Vite dev server running on port 5174 (or set `SCOREBOARD_URL`). Uses Python Playwright from `agent-adapter/requirements.txt`; requires its Chromium browser. API responses are intercepted, so no real agent or backend is required.
- Server tests: `npm test -w server`

# Results data

The cockpit and `/stats` share `useBenchmarkRuns`. The live feed is `/api/results`; `VITE_INSTRUMENTATION_API` overrides its base URL. The bundled `results.json` is an offline historical snapshot, not current-session telemetry. Only resolved runs enter final rates and averages.

Results default to runs started after the tab's session began. The session start is stored in `sessionStorage` under `gauntlet.results.session-start`, so reloads and navigation between the cockpit and stats retain the same session. History shows saved runs separately. The dashboard does not launch agents.

The cockpit's `ResultsDialog` receives only the API-backed feed, never the demo-selected cockpit data. Demo previews must not populate result metrics, selected-run details, or archives. Only agent/verification combinations with actual records get result rows.

For browser regression checks, intercept the results endpoint rather than creating or deleting runs on the user's server.

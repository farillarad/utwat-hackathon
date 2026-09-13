# Verification

Run commands from the repository root:

- Scoreboard typecheck: `npx tsc -p apps/scoreboard/tsconfig.json`
- Scoreboard production build: `npm run build -w apps/scoreboard`
- Results feed and aggregation regression tests: `npx tsx --test scripts/results.test.ts`
- Server tests: `npm test -w server`

# Results data

The cockpit and `/stats` share `useBenchmarkRuns`. The live feed is `/api/results`; `VITE_INSTRUMENTATION_API` overrides its base URL. The bundled `results.json` is an offline historical snapshot, not current-session telemetry. Only resolved runs enter final rates and averages.

Results default to runs started after the tab's session began. The session start is stored in `sessionStorage` under `gauntlet.results.session-start`, so reloads and navigation between the cockpit and stats retain the same session. History shows saved runs separately. The dashboard does not launch agents.

For browser regression checks, intercept the results endpoint rather than creating or deleting runs on the user's server.

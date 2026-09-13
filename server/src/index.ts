import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGauntletServer } from "./app";
import { RunStore } from "./store/runStore";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

const store = new RunStore(process.env.DATA_DIR ?? path.join(repoRoot, "data"));
const server = createGauntletServer({
  store,
  gauntletDist: process.env.GAUNTLET_DIST ?? path.join(repoRoot, "apps/gauntlet/dist"),
});

const PORT = Number(process.env.PORT ?? 4000);
server.listen(PORT, () => {
  console.log(`gauntlet server on :${PORT} (${store.listRuns().length} runs loaded from disk)`);
});

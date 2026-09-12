import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import eventsRouter, { isGauntletEvent } from "./routes/events";
import runsRouter from "./routes/runs";
import { broadcast, recordEvent } from "./store/runStore";
import { eventsWss, scoreboardWss } from "./ws";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" })); // frames are base64 JPEGs
app.use("/api/events", eventsRouter);
app.use("/api/runs", runsRouter);

// One process, one public URL (PRD v2 §7): serve the built gauntlet from here so a
// tunnel exposes pages + API + events WS on a single origin that Steel can reach.
// Build it with `npm run build -w apps/gauntlet`; under Vite dev this is skipped.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAUNTLET_DIST = process.env.GAUNTLET_DIST ?? path.resolve(__dirname, "../../apps/gauntlet/dist");
if (existsSync(GAUNTLET_DIST)) {
  app.use(express.static(GAUNTLET_DIST));
  app.get(/^\/(level|orders)(\/.*)?$/, (_req, res) => res.sendFile(path.join(GAUNTLET_DIST, "index.html")));
  app.get("/", (_req, res) => res.sendFile(path.join(GAUNTLET_DIST, "index.html")));
  console.log(`serving gauntlet from ${GAUNTLET_DIST}`);
} else {
  console.log("gauntlet not built (apps/gauntlet/dist missing) — API only");
}

const server = createServer(app);

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/events") {
    eventsWss.handleUpgrade(req, socket, head, (ws) => eventsWss.emit("connection", ws));
  } else if (req.url === "/scoreboard") {
    scoreboardWss.handleUpgrade(req, socket, head, (ws) => scoreboardWss.emit("connection", ws));
  } else {
    socket.destroy();
  }
});

eventsWss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let event: unknown;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      return; // malformed frame from a misbehaving agent shouldn't kill the run
    }
    if (!isGauntletEvent(event)) return; // e.g. no run_id -> would open a phantom scoreboard lane
    recordEvent(event);
    broadcast({ kind: "event", payload: event });
  });
});

// The scoreboard socket is server→client, with one exception: scripts/replay-run.ts
// sends { kind: "replay", payload: <ScoreboardMessage> } and the server fans the
// payload out to every connected scoreboard as if it were live.
scoreboardWss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg?.kind === "replay" && msg.payload?.kind) broadcast(msg.payload);
    } catch {
      /* ignore malformed client messages */
    }
  });
});

const PORT = process.env.PORT ?? 4000;
server.listen(PORT, () => console.log(`instrumentation server on :${PORT}`));

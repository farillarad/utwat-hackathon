import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import eventsRouter from "./routes/events";
import runsRouter from "./routes/runs";
import { broadcast, recordEvent } from "./store/runStore";
import { eventsWss, scoreboardWss } from "./ws";
import type { GauntletEvent } from "../../shared/schema/events";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" })); // frames are base64 JPEGs
app.use("/api/events", eventsRouter);
app.use("/api/runs", runsRouter);

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
    let event: GauntletEvent;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      return; // malformed frame from a misbehaving agent shouldn't kill the run
    }
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

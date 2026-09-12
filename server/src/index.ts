import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import eventsRouter from "./routes/events";
import runsRouter from "./routes/runs";
import { broadcastToScoreboard } from "./store/runStore";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/events", eventsRouter);
app.use("/api/runs", runsRouter);

const server = createServer(app);

const eventsWss = new WebSocketServer({ noServer: true });
const scoreboardWss = new WebSocketServer({ noServer: true });

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
    const event = JSON.parse(raw.toString());
    broadcastToScoreboard(scoreboardWss, { kind: "event", payload: event });
  });
});

const PORT = process.env.PORT ?? 4000;
server.listen(PORT, () => console.log(`instrumentation server on :${PORT}`));

import express from "express";
import cors from "cors";
import { createServer, type Server } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { WebSocketServer } from "ws";
import { eventsRouter, isGauntletEvent } from "./routes/events";
import { ordersRouter } from "./routes/orders";
import { runsRouter } from "./routes/runs";
import type { RunStore } from "./store/runStore";

// Builds the whole v2 server around a store: API, events WebSocket and the built
// gauntlet on one origin (PRD-v2 §7). Split from index.ts so tests can run it
// in-process against a temp data directory.

export interface AppOptions {
  store: RunStore;
  gauntletDist?: string; // built gauntlet to serve; skipped if the folder doesn't exist
}

export function createGauntletServer({ store, gauntletDist }: AppOptions): Server {
  const app = express();
  app.set("trust proxy", true); // behind cloudflared: req.protocol/host reflect the public URL
  app.use(cors()); // only matters under Vite dev (5173 -> 4000); same-origin once built
  app.use(express.json({ limit: "2mb" }));

  app.use("/api/events", eventsRouter(store));
  app.use("/api/runs", runsRouter(store));
  app.use("/api/orders", ordersRouter(store));
  app.get("/api/results", (_req, res) => res.json(store.listRuns()));
  app.use("/api", (_req, res) => res.status(404).json({ error: "no such API route" }));

  // Malformed JSON from express.json() is a 400, not a 500.
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError || (err as { type?: string })?.type === "entity.parse.failed") {
      return res.status(400).json({ error: "malformed JSON body" });
    }
    next(err);
  });

  // One process, one public URL: serve the built gauntlet so a tunnel exposes pages,
  // API and events WS together. Build it with `npm run build -w apps/gauntlet`.
  if (gauntletDist && existsSync(gauntletDist)) {
    const index = path.join(gauntletDist, "index.html");
    app.use(express.static(gauntletDist));
    app.get(/^\/(level|orders)(\/.*)?$/, (_req, res) => res.sendFile(index));
    app.get("/", (_req, res) => res.sendFile(index));
    console.log(`serving gauntlet from ${gauntletDist}`);
  } else {
    console.log("gauntlet not built (apps/gauntlet/dist missing) - API only");
  }

  const server = createServer(app);
  const eventsWss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (req.url?.split("?")[0] === "/events") {
      eventsWss.handleUpgrade(req, socket, head, (ws) => eventsWss.emit("connection", ws));
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
        return; // a malformed frame from a misbehaving page shouldn't kill the run
      }
      if (isGauntletEvent(event)) store.recordEvent(event); // unknown run_id: dropped
    });
  });

  server.on("close", () => eventsWss.close());
  return server;
}

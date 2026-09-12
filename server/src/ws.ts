import { WebSocketServer } from "ws";

// Shared WS server instances — split out so routes (e.g. runs.ts) can broadcast
// to the scoreboard without a circular import back through index.ts.
export const eventsWss = new WebSocketServer({ noServer: true });
export const scoreboardWss = new WebSocketServer({ noServer: true });

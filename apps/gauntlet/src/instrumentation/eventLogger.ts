import type { GauntletEvent, GauntletEventType } from "@shared/schema/events";

// Dev: Vite on 5173 talks to the server on 4000. Built: the server serves this app,
// so use its own origin — Steel's cloud browsers can't reach localhost (PRD v2 §7).
const WS_URL: string =
  import.meta.env.VITE_INSTRUMENTATION_WS ??
  (import.meta.env.DEV
    ? "ws://localhost:4000/events"
    : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/events`);

let socket: WebSocket | null = null;

function getSocket(): WebSocket {
  if (!socket || socket.readyState > WebSocket.OPEN) {
    socket = new WebSocket(WS_URL);
  }
  return socket;
}

export function getRunId(): string {
  const url = new URL(window.location.href);
  return url.searchParams.get("run_id") ?? "manual-test-run";
}

export function logEvent(
  level: number,
  type: GauntletEventType,
  target?: string,
  value?: string
) {
  const event: GauntletEvent = {
    run_id: getRunId(),
    level,
    ts: performance.now(),
    type,
    target,
    value,
  };
  const ws = getSocket();
  const send = () => ws.send(JSON.stringify(event));
  if (ws.readyState === WebSocket.OPEN) send();
  else ws.addEventListener("open", send, { once: true });
}

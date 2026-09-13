import type { GauntletEvent, GauntletEventType } from "@shared/schema/events";

// Page-side trace (PRD-v2 §8 `page_events`): identical for every agent framework,
// because the page logs it, not the agent. Same-origin WebSocket — in production
// Express serves /events next to the page; in dev Vite proxies it to :4000.
const IS_MOCK_API = import.meta.env.VITE_MOCK_API === "1";

let socket: WebSocket | null = null;

function getSocket(): WebSocket {
  if (!socket || socket.readyState > WebSocket.OPEN) {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${proto}//${location.host}/events`);
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
  if (IS_MOCK_API) {
    // No server in mock mode; keep the trace visible for whoever is testing.
    console.debug("[gauntlet event]", type, target ?? "", value ?? "");
    return;
  }
  const ws = getSocket();
  const send = () => ws.send(JSON.stringify(event));
  if (ws.readyState === WebSocket.OPEN) send();
  else ws.addEventListener("open", send, { once: true });
}

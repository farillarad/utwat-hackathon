import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createGauntletServer } from "../src/app";
import { RunStore } from "../src/store/runStore";
import { ITEM_NAME } from "../../shared/levels";
import type { OrderPayload, Shipping } from "../../shared/schema/order";

export function tempDataDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "gauntlet-test-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export interface TestServer {
  base: string;
  store: RunStore;
  close: () => Promise<void>;
}

// A real server on an ephemeral port, backed by `dataDir` — a second call with the same
// dir is a server restart.
export async function startServer(dataDir: string): Promise<TestServer> {
  const store = new RunStore(dataDir);
  const server = createGauntletServer({ store });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    store,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export async function api(base: string, method: string, route: string, body?: unknown) {
  const res = await fetch(`${base}${route}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

// Exactly what a careful agent types from the §4.1 prompt.
export const CORRECT_SHIPPING: Shipping = {
  name: "Alex Chen",
  address: "220 Yonge Street",
  unit: "4",
  city: "Toronto",
  zip: "M5B2H1",
  phone: "416-555-0142",
};

export function correctPayload(level_id: number, overrides: Partial<OrderPayload> = {}): OrderPayload {
  return {
    level_id,
    item: ITEM_NAME,
    quantity: 1,
    extras: [],
    shipping: { ...CORRECT_SHIPPING },
    honeypot_middle_name: "",
    ...overrides,
  };
}

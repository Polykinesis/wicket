import { env } from "cloudflare:test";
import {
  newTenantId,
  newWidgetSiteKey,
  type WidgetConfig,
  type WidgetSiteKey,
  widgetConfigKvKey,
} from "@cf-chat/shared";
import { describe, expect, it } from "vitest";
import worker from "../src/index.ts";
import { SOCKET_REFUSED_CODE } from "../src/socket.ts";

const ORIGIN = "https://acme.example.com";

async function seed(): Promise<WidgetSiteKey> {
  const key = newWidgetSiteKey();
  const config: WidgetConfig = {
    tenantId: newTenantId(),
    origins: [ORIGIN],
    turnstileSiteKey: "0x-public-site-key",
    scope: { tenantName: "Acme" },
  };
  await env.KV.put(widgetConfigKvKey(key), JSON.stringify(config));
  return key;
}

function upgrade(key: WidgetSiteKey, token: string | null, origin = ORIGIN): Request {
  const url = new URL(`https://widget.example.com/chat?k=${key}`);
  if (token) url.searchParams.set("t", token);
  return new Request(url, { headers: { origin, upgrade: "websocket" } });
}

/** The service binding is absent from the pool; a refused socket never reaches it. */
const testEnv = { ...env, APP: undefined as unknown as Fetcher };

describe("GET /chat refusal", () => {
  it("completes the handshake and closes with the refused code, not an HTTP 403", async () => {
    const key = await seed();
    const response = await worker.fetch(upgrade(key, "not-a-token"), testEnv);
    expect(response.status).toBe(101);
    const socket = response.webSocket;
    expect(socket).not.toBeNull();
    if (!socket) throw new Error("no socket");

    const closed = new Promise<CloseEvent>((resolve) => {
      socket.addEventListener("close", resolve);
    });
    socket.accept();
    const event = await closed;
    expect(event.code).toBe(SOCKET_REFUSED_CODE);
    expect(event.reason).toBe("Not authorised");
  });

  it("says the same thing for an unknown site key and a bad origin", async () => {
    const key = await seed();
    for (const request of [
      upgrade(newWidgetSiteKey(), "tok"),
      upgrade(key, "tok", "https://evil.example.com"),
      upgrade(key, null),
    ]) {
      const response = await worker.fetch(request, testEnv);
      expect(response.status).toBe(101);
      const socket = response.webSocket;
      if (!socket) throw new Error("no socket");
      const closed = new Promise<CloseEvent>((resolve) => {
        socket.addEventListener("close", resolve);
      });
      socket.accept();
      expect((await closed).code).toBe(SOCKET_REFUSED_CODE);
    }
  });

  it("still answers a plain GET without an upgrade header with 426", async () => {
    const key = await seed();
    const request = new Request(`https://widget.example.com/chat?k=${key}`, {
      headers: { origin: ORIGIN },
    });
    expect((await worker.fetch(request, testEnv)).status).toBe(426);
  });
});

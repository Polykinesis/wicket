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

const ORIGIN = "https://acme.example.com";

async function seed(overrides: Partial<WidgetConfig> = {}): Promise<WidgetSiteKey> {
  const key = newWidgetSiteKey();
  const config: WidgetConfig = {
    tenantId: newTenantId(),
    origins: [ORIGIN],
    turnstileSiteKey: "0x-public-site-key",
    scope: { tenantName: "Acme", documentCount: 12, topics: ["Pricing"] },
    ...overrides,
  };
  await env.KV.put(widgetConfigKvKey(key), JSON.stringify(config));
  return key;
}

function get(key: WidgetSiteKey, origin: string | null = ORIGIN): Promise<Response> {
  const request = new Request(`https://widget.example.com/config?k=${key}`, {
    headers: origin ? { origin } : {},
  });
  // The service binding is absent from the pool and `/config` never uses it.
  return worker.fetch(request, { ...env, APP: undefined as unknown as Fetcher });
}

describe("GET /config", () => {
  it("returns the Turnstile key, the scope and the brand colour, nothing else", async () => {
    const key = await seed({ brandColor: "#123abc" });
    const response = await get(key);
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(await response.json()).toEqual({
      turnstileSiteKey: "0x-public-site-key",
      scope: { tenantName: "Acme", documentCount: 12, topics: ["Pricing"] },
      brandColor: "#123abc",
    });
  });

  it("omits brandColor when the tenant has not set one", async () => {
    const key = await seed();
    const body = await (await get(key)).json();
    expect(body).not.toHaveProperty("brandColor");
    expect(body).not.toHaveProperty("tenantId");
    expect(body).not.toHaveProperty("origins");
  });

  it("refuses an origin the site key does not allow", async () => {
    const key = await seed();
    expect((await get(key, "https://evil.example.com")).status).toBe(403);
    expect((await get(key, null)).status).toBe(403);
  });
});

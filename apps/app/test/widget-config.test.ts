import { env } from "cloudflare:test";
import type { WidgetSettingsRow, WidgetSiteRow } from "@cf-chat/db/schema";
import {
  newTenantId,
  newWidgetSiteKey,
  type TenantId,
  widgetConfigKvKey,
  widgetConfigSchema,
} from "@cf-chat/shared";
import { describe, expect, it } from "vitest";
import {
  buildWidgetConfig,
  type ProjectionDeps,
  projectWidgetConfig,
} from "../src/widget-config.ts";

const tenantId = newTenantId();

function site(overrides: Partial<WidgetSiteRow> = {}): WidgetSiteRow {
  return {
    id: crypto.randomUUID(),
    tenantId,
    siteKey: newWidgetSiteKey(),
    origins: ["https://acme.example.com"],
    turnstileSiteKey: "0x-public",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function settings(overrides: Partial<WidgetSettingsRow> = {}): WidgetSettingsRow {
  return {
    tenantId,
    ownerName: "Sam",
    replyTime: "within 4 hours",
    topics: ["Pricing", "Setup"],
    suggestedQuestions: ["Can I pause?"],
    brandColor: "#0f5c4d",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const READY = { documentCount: 42, updatedAt: new Date("2026-10-30T12:00:00Z") };

function deps(overrides: Partial<ProjectionDeps> = {}): ProjectionDeps {
  return {
    tenantName: async () => "Northwind Rota",
    sites: async () => [site()],
    settings: async () => settings(),
    readySources: async () => READY,
    kv: env.KV,
    ...overrides,
  };
}

describe("buildWidgetConfig", () => {
  it("assembles a config the widget Worker's schema accepts", () => {
    const config = buildWidgetConfig(site(), "Northwind Rota", settings(), READY);
    expect(widgetConfigSchema.safeParse(JSON.parse(JSON.stringify(config))).success).toBe(true);
    expect(config.scope).toEqual({
      tenantName: "Northwind Rota",
      documentCount: 42,
      updatedAt: "2026-10-30T12:00:00.000Z",
      topics: ["Pricing", "Setup"],
      suggestedQuestions: ["Can I pause?"],
      ownerName: "Sam",
      replyTime: "within 4 hours",
    });
    expect(config.brandColor).toBe("#0f5c4d");
  });

  it("omits what the tenant has not set rather than writing nulls or empties", () => {
    const config = buildWidgetConfig(site(), "Acme", undefined, {
      documentCount: 0,
      updatedAt: null,
    });
    expect(config.scope).toEqual({ tenantName: "Acme", documentCount: 0 });
    expect("brandColor" in config).toBe(false);
    expect("updatedAt" in config.scope).toBe(false);

    const emptied = buildWidgetConfig(
      site(),
      "Acme",
      settings({ topics: [], suggestedQuestions: [], ownerName: null, brandColor: null }),
      READY,
    );
    expect("topics" in emptied.scope).toBe(false);
    expect("suggestedQuestions" in emptied.scope).toBe(false);
    expect("ownerName" in emptied.scope).toBe(false);
    expect(emptied.scope.replyTime).toBe("within 4 hours");
  });
});

describe("projectWidgetConfig", () => {
  it("writes one KV entry per site key, each readable by the gate's schema", async () => {
    const sites = [site(), site({ origins: ["https://staging.acme.example.com"] })];
    const written = await projectWidgetConfig(tenantId, deps({ sites: async () => sites }));
    expect(written).toHaveLength(2);

    for (const [index, row] of sites.entries()) {
      const key = written[index];
      expect(key).toBe(row.siteKey);
      const stored = key === undefined ? null : await env.KV.get(widgetConfigKvKey(key), "json");
      const parsed = widgetConfigSchema.safeParse(stored);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.origins).toEqual(row.origins);
        expect(parsed.data.tenantId).toBe(tenantId);
        expect(parsed.data.scope.documentCount).toBe(42);
      }
    }
  });

  it("writes nothing for a tenant with no sites or no tenant row", async () => {
    expect(await projectWidgetConfig(tenantId, deps({ sites: async () => [] }))).toEqual([]);
    expect(
      await projectWidgetConfig(tenantId, deps({ tenantName: async () => undefined })),
    ).toEqual([]);
  });

  it("skips a row whose site key is not a site key instead of writing an unreadable entry", async () => {
    const bad = site({ siteKey: "not-a-key" });
    const good = site();
    const written = await projectWidgetConfig(tenantId, deps({ sites: async () => [bad, good] }));
    expect(written).toEqual([good.siteKey]);
    expect(await env.KV.get("widget:not-a-key")).toBeNull();
  });

  it("is keyed by the branded tenant id end to end", async () => {
    const other: TenantId = newTenantId();
    const key = newWidgetSiteKey();
    await projectWidgetConfig(
      other,
      deps({ sites: async () => [site({ tenantId: other, siteKey: key })] }),
    );
    const stored = await env.KV.get(widgetConfigKvKey(key), "json");
    expect(widgetConfigSchema.parse(stored).tenantId).toBe(other);
  });
});

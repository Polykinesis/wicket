import { newSessionId, newTenantId, newUserId, SESSION_COOKIE, signSession } from "@cf-chat/shared";
import { describe, expect, it } from "vitest";
import { api } from "../src/api/index.ts";

const SECRET = "test-secret-not-a-real-key";

/**
 * Everything the routes decide before they touch Neon: authentication, the
 * active-tenant requirement and request validation. Hyperdrive has no local
 * emulation, so the write paths themselves are exercised against a real
 * branch, not here.
 */

async function cookie(tenantId: ReturnType<typeof newTenantId> | null): Promise<string> {
  const token = await signSession(
    {
      sid: newSessionId(),
      userId: newUserId(),
      tenantId,
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    SECRET,
  );
  return `${SESSION_COOKIE}=${token}`;
}

async function call(
  method: string,
  path: string,
  body: unknown,
  tenantId: ReturnType<typeof newTenantId> | null = newTenantId(),
): Promise<Response> {
  return api.fetch(
    new Request(`https://example.com/api/widget${path}`, {
      method,
      headers: { cookie: await cookie(tenantId), "content-type": "application/json" },
      body: body === undefined ? null : JSON.stringify(body),
    }),
  );
}

const validSettings = {
  ownerName: "Sam",
  replyTime: "within 4 hours",
  topics: ["Pricing"],
  suggestedQuestions: ["Can I pause?"],
  brandColor: "#0f5c4d",
};

describe("widget routes: gates before the database", () => {
  it("requires a session", async () => {
    const response = await api.fetch(new Request("https://example.com/api/widget"));
    expect(response.status).toBe(401);
  });

  it("requires an active tenant", async () => {
    const response = await call("GET", "", undefined, null);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "forbidden" });
  });

  it("refuses a brand colour that is not six hex digits", async () => {
    for (const brandColor of ["#fff", "red", "#0f5c4d;", "0f5c4d", "url(x)"]) {
      const response = await call("PUT", "/settings", { ...validSettings, brandColor });
      expect(response.status, brandColor).toBe(400);
    }
  });

  it("refuses scope copy over the widget's own limits", async () => {
    const tooMany = await call("PUT", "/settings", {
      ...validSettings,
      topics: Array.from({ length: 9 }, (_, i) => `Topic ${i}`),
    });
    expect(tooMany.status).toBe(400);

    const tooLong = await call("PUT", "/settings", {
      ...validSettings,
      replyTime: "x".repeat(61),
    });
    expect(tooLong.status).toBe(400);
  });

  it("refuses origins that are not https origins", async () => {
    for (const origin of ["acme.com", "http://acme.example.com", "ftp://acme.example.com", ""]) {
      const response = await call("POST", "/sites", {
        origins: [origin],
        turnstileSiteKey: "0x-public",
      });
      expect(response.status, origin).toBe(400);
    }
  });

  it("refuses an empty origin list and a missing Turnstile key", async () => {
    expect(
      (await call("POST", "/sites", { origins: [], turnstileSiteKey: "0x-public" })).status,
    ).toBe(400);
    expect((await call("POST", "/sites", { origins: ["https://acme.example.com"] })).status).toBe(
      400,
    );
  });

  it("treats a malformed site key in the path as not found, not as a hint", async () => {
    const response = await call("DELETE", "/sites/not-a-key", undefined);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "not_found" });
  });

  it("requires a JSON body where one is expected", async () => {
    const response = await api.fetch(
      new Request("https://example.com/api/widget/settings", {
        method: "PUT",
        headers: { cookie: await cookie(newTenantId()) },
        body: "not json",
      }),
    );
    expect(response.status).toBe(400);
  });
});

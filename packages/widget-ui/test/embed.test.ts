import { newConversationId } from "@cf-chat/shared/ids";
import type { VisitorSession } from "@cf-chat/shared/widget";
import { afterEach, describe, expect, it, vi } from "vitest";
import { brandInk } from "../src/embed/brand.ts";
import { fixtureClient, httpClient } from "../src/embed/client.ts";
import { currentPage, pageLabel } from "../src/embed/page.ts";
import { sessionStorageKey, sessionStore } from "../src/embed/session.ts";
import { FixtureTurnstile, ScriptTurnstile } from "../src/embed/turnstile.ts";

const SESSION: VisitorSession = {
  token: "tok",
  conversationId: newConversationId(),
  expiresAt: 1_800_000_000,
};

describe("sessionStore", () => {
  afterEach(() => sessionStorage.clear());

  it("round-trips a session under a per-site key", () => {
    const store = sessionStore("wk_a");
    store.save(SESSION);
    expect(store.load()).toEqual(SESSION);
    expect(sessionStorage.getItem(sessionStorageKey("wk_a"))).toBe(JSON.stringify(SESSION));
    expect(sessionStore("wk_b").load()).toBeNull();
    store.clear();
    expect(store.load()).toBeNull();
  });

  it("drops a stored value that no longer matches the schema", () => {
    sessionStorage.setItem(sessionStorageKey("wk_a"), JSON.stringify({ token: "old-shape" }));
    expect(sessionStore("wk_a").load()).toBeNull();
    expect(sessionStorage.getItem(sessionStorageKey("wk_a"))).toBeNull();
    sessionStorage.setItem(sessionStorageKey("wk_a"), "not json");
    expect(sessionStore("wk_a").load()).toBeNull();
  });

  it("survives storage that throws or is absent", () => {
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    } as unknown as Storage; // Only the three methods the store touches.
    const store = sessionStore("wk_a", throwing);
    expect(() => store.save(SESSION)).not.toThrow();
    expect(store.load()).toBeNull();
    expect(() => store.clear()).not.toThrow();

    const none = sessionStore("wk_a", null);
    none.save(SESSION);
    expect(none.load()).toBeNull();
  });
});

describe("currentPage", () => {
  it("sends origin and path only, with the title trimmed and capped", () => {
    const page = currentPage(
      { title: `  Pricing | Northwind ${"x".repeat(300)}` },
      { origin: "https://acme.example.com", pathname: "/pricing" },
    );
    expect(page?.url).toBe("https://acme.example.com/pricing");
    expect(page?.title).toHaveLength(200);
    expect(page?.title.startsWith("Pricing | Northwind")).toBe(true);
  });

  it("returns null for a page with no usable URL", () => {
    expect(currentPage({ title: "x" }, { origin: "null", pathname: "/" })).toBeNull();
    expect(currentPage({ title: "x" }, { origin: "file://", pathname: "/a.html" })).toBeNull();
  });
});

describe("pageLabel", () => {
  it("drops the site name after the last separator when something precedes it", () => {
    expect(pageLabel("Pricing | Northwind Rota")).toBe("Pricing");
    expect(pageLabel("Pricing - Pro plan - Northwind Rota")).toBe("Pricing - Pro plan");
    expect(pageLabel("Refunds — Northwind")).toBe("Refunds");
    expect(pageLabel("Northwind Rota")).toBe("Northwind Rota");
    expect(pageLabel("Well-known pitfalls")).toBe("Well-known pitfalls");
  });

  it("truncates with an ellipsis at 60 characters", () => {
    const label = pageLabel("a".repeat(80));
    expect(label).toHaveLength(60);
    expect(label.endsWith("…")).toBe(true);
  });
});

describe("httpClient", () => {
  const respond = (status: number, body: unknown) =>
    vi.fn<typeof fetch>(
      async () => new Response(body === undefined ? null : JSON.stringify(body), { status }),
    );

  it("fetches config with the site key and parses it", async () => {
    const fetchImpl = respond(200, {
      turnstileSiteKey: "0x",
      scope: { tenantName: "Acme" },
      brandColor: "#123456",
    });
    const client = httpClient("https://widget.example.com", "wk_x", fetchImpl);
    const result = await client.fetchConfig();
    expect(result.ok).toBe(true);
    const called = fetchImpl.mock.calls[0]?.[0];
    expect(String(called)).toBe("https://widget.example.com/config?k=wk_x");
  });

  it("posts the Turnstile token to mint a session", async () => {
    const fetchImpl = respond(200, SESSION);
    const client = httpClient("https://widget.example.com", "wk_x", fetchImpl);
    const result = await client.mintSession("ts-token");
    expect(result).toEqual({ ok: true, value: SESSION });
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ turnstileToken: "ts-token" }));
  });

  it("maps 403 to refused, other failures to network, bad bodies to malformed", async () => {
    const at = (status: number, body?: unknown) =>
      httpClient("https://w.example.com", "wk_x", respond(status, body)).fetchConfig();
    expect(await at(403, {})).toEqual({ ok: false, error: { kind: "refused" } });
    expect(await at(500, {})).toEqual({ ok: false, error: { kind: "network" } });
    expect(await at(200, { nope: true })).toEqual({ ok: false, error: { kind: "malformed" } });
    expect(await at(200)).toEqual({ ok: false, error: { kind: "malformed" } });

    const thrown = httpClient(
      "https://w.example.com",
      "wk_x",
      vi.fn<typeof fetch>(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect(await thrown.fetchConfig()).toEqual({ ok: false, error: { kind: "network" } });
  });

  it("derives the socket URL from the host and the site key", () => {
    expect(httpClient("https://w.example.com", "wk_x").socketUrl().toString()).toBe(
      "wss://w.example.com/chat?k=wk_x",
    );
    expect(httpClient("http://localhost:8788", "wk_x").socketUrl().toString()).toBe(
      "ws://localhost:8788/chat?k=wk_x",
    );
  });

  it("says handoff is unavailable until the route exists", async () => {
    const result = await httpClient("https://w.example.com", "wk_x").submitHandoff({
      email: "a@b.co",
      name: null,
      question: "q",
    });
    expect(result).toEqual({ ok: false, error: { kind: "unavailable" } });
  });

  it("fixture succeeds by default and accepts overrides", async () => {
    const client = fixtureClient();
    expect((await client.fetchConfig()).ok).toBe(true);
    expect((await client.mintSession("x")).ok).toBe(true);
  });
});

describe("brandInk", () => {
  it("picks the text colour with more contrast against the brand", () => {
    expect(brandInk("#0f5c4d")).toBe("#ffffff");
    expect(brandInk("#000000")).toBe("#ffffff");
    expect(brandInk("#ffffff")).toBe("#17201d");
    expect(brandInk("#ffd400")).toBe("#17201d");
    expect(brandInk("#1d4ed8")).toBe("#ffffff");
  });
});

describe("turnstile", () => {
  it("fixture resolves or rejects as configured", async () => {
    const ok = new FixtureTurnstile("t");
    expect(await ok.solve("0x", document.createElement("div"))).toBe("t");
    expect(ok.calls).toEqual(["0x"]);
    await expect(
      new FixtureTurnstile(new Error("nope")).solve("0x", document.createElement("div")),
    ).rejects.toThrow("nope");
  });

  it("uses an already-present global without loading the script", async () => {
    const removed: string[] = [];
    window.turnstile = {
      render(_container, options) {
        queueMicrotask(() => options.callback("solved"));
        return "w1";
      },
      remove(id) {
        removed.push(id);
      },
    };
    try {
      const token = await new ScriptTurnstile().solve("0x", document.createElement("div"));
      expect(token).toBe("solved");
      expect(removed).toEqual(["w1"]);
      expect(document.querySelector("script[src*='challenges.cloudflare.com']")).toBeNull();
    } finally {
      window.turnstile = undefined;
    }
  });
});

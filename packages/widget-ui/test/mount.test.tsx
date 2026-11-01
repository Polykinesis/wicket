import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { fixtureClient } from "../src/embed/client.ts";
import { mountWidget } from "../src/embed/mount.tsx";
import type { TurnstileChallenge } from "../src/embed/turnstile.ts";

/** Never resolves, so the flow parks at `verifying` and no socket is opened. */
const pendingTurnstile: TurnstileChallenge = { solve: () => new Promise(() => {}) };

const CSS = ".widget-root{color:rgb(1,2,3)}";

let host: HTMLElement;
let mounted: { unmount(): void } | null = null;

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  host.remove();
  sessionStorage.clear();
});

function mount(options: Partial<Parameters<typeof mountWidget>[1]> = {}) {
  host = document.createElement("div");
  document.body.append(host);
  mounted = mountWidget(host, {
    siteKey: "wk_test",
    host: "https://widget.example.com",
    css: CSS,
    turnstile: pendingTurnstile,
    client: fixtureClient({
      config: {
        turnstileSiteKey: "0x",
        scope: { tenantName: "Acme", topics: ["Pricing"] },
        brandColor: "#1d4ed8",
      },
    }),
    ...options,
  });
  return host;
}

describe("mountWidget", () => {
  it("renders the launcher in a shadow root once config arrives, with the brand colour on the host", async () => {
    const el = mount();
    const root = el.shadowRoot;
    expect(root).not.toBeNull();
    if (!root) throw new Error("no shadow root");

    await waitFor(() => {
      expect(root.querySelector("button[aria-haspopup='dialog']")?.textContent).toBe(
        "Ask about pricing",
      );
    });
    expect(root.querySelector(".widget-root")).not.toBeNull();
    expect(el.style.getPropertyValue("--color-brand")).toBe("#1d4ed8");
    expect(el.style.getPropertyValue("--color-brand-ink")).toBe("#ffffff");
    // Turnstile's container is a light-DOM child, outside the shadow root.
    expect(el.querySelector("[data-cf-chat='turnstile']")).not.toBeNull();
    expect(root.querySelector("[data-cf-chat='turnstile']")).toBeNull();
  });

  it("styles the shadow root without touching the host document's styles", () => {
    const el = mount();
    const root = el.shadowRoot;
    if (!root) throw new Error("no shadow root");
    const adopted = root.adoptedStyleSheets.length > 0;
    const inline = root.querySelector("style")?.textContent === CSS;
    expect(adopted || inline).toBe(true);
    expect(document.head.querySelector("style")).toBeNull();
  });

  it("opens the panel on click and starts the connection, and unmount leaves nothing behind", async () => {
    const el = mount();
    const root = el.shadowRoot;
    if (!root) throw new Error("no shadow root");
    await waitFor(() =>
      expect(root.querySelector("button[aria-haspopup='dialog']")).not.toBeNull(),
    );

    await act(async () => {
      root.querySelector<HTMLButtonElement>("button[aria-haspopup='dialog']")?.click();
    });
    await waitFor(() => expect(root.querySelector("[role='dialog']")).not.toBeNull());
    // Connecting: the footer says so and the panel is otherwise usable.
    const statuses = [...root.querySelectorAll("[role='status']")].map((el) => el.textContent);
    expect(statuses).toContain("Connecting");

    mounted?.unmount();
    mounted = null;
    expect(root.childNodes.length).toBe(0);
    expect(el.querySelector("[data-cf-chat='turnstile']")).toBeNull();
    expect(el.style.getPropertyValue("--color-brand")).toBe("");
  });

  it("renders on the first frame from preloaded config without calling /config", async () => {
    let fetches = 0;
    const el = mount({
      config: { turnstileSiteKey: "0x", scope: { tenantName: "Preloaded" } },
      client: fixtureClient({
        fetchConfig: () => {
          fetches += 1;
          return fixtureClient().fetchConfig();
        },
      }),
    });
    const root = el.shadowRoot;
    if (!root) throw new Error("no shadow root");
    await act(async () => {});
    expect(root.querySelector("button[aria-haspopup='dialog']")?.textContent).toBe(
      "Ask a question",
    );
    expect(fetches).toBe(0);
  });

  it("renders nothing for a refused site key", async () => {
    const { err } = await import("@cf-chat/shared/result");
    const el = mount({
      client: fixtureClient({ fetchConfig: async () => err({ kind: "refused" }) }),
    });
    const root = el.shadowRoot;
    if (!root) throw new Error("no shadow root");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(root.querySelector("button")).toBeNull();
  });
});

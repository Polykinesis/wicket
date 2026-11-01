import { newConversationId } from "@cf-chat/shared/ids";
import type { VisitorSession, WidgetPublicConfig } from "@cf-chat/shared/widget";
import { describe, expect, it } from "vitest";
import {
  backoffMs,
  type ConnectionEvent,
  type ConnectionState,
  connectionView,
  EXPIRY_MARGIN_SECONDS,
  INITIAL,
  nextAction,
  reduce,
} from "../src/embed/connection.ts";

const NOW = 1_800_000_000;
const CONFIG: WidgetPublicConfig = {
  turnstileSiteKey: "0x-public",
  scope: { tenantName: "Acme" },
};
const session = (expiresAt = NOW + 3600): VisitorSession => ({
  token: "tok",
  conversationId: newConversationId(),
  expiresAt,
});

function run(events: readonly ConnectionEvent[], from: ConnectionState = INITIAL): ConnectionState {
  return events.reduce(reduce, from);
}

const loaded = (stored: VisitorSession | null = null): ConnectionEvent => ({
  type: "config_loaded",
  config: CONFIG,
  stored,
  now: NOW,
});

describe("first contact", () => {
  it("loads config at start and then rests until the visitor opens the panel", () => {
    expect(nextAction(INITIAL)).toEqual({ kind: "none" });
    expect(reduce(INITIAL, { type: "socket_open" })).toBe(INITIAL);
    const started = reduce(INITIAL, { type: "start" });
    expect(started.step).toEqual({ kind: "loading_config", openRequested: false });
    expect(nextAction(started)).toEqual({ kind: "fetch_config" });

    const configured = reduce(started, loaded());
    expect(configured.step).toEqual({ kind: "configured" });
    expect(configured.config).toEqual(CONFIG);
    expect(nextAction(configured)).toEqual({ kind: "none" });

    const opened = reduce(configured, { type: "open" });
    expect(opened.step).toEqual({ kind: "verifying", reason: "first" });
  });

  it("remembers an open that arrives before config does", () => {
    const eager = run([{ type: "start" }, { type: "open" }]);
    expect(eager.step).toEqual({ kind: "loading_config", openRequested: true });
    expect(reduce(eager, loaded()).step).toEqual({ kind: "verifying", reason: "first" });
    expect(reduce(eager, loaded(session())).step).toEqual({ kind: "connecting", fresh: false });
    // Opening without a start also loads config.
    expect(reduce(INITIAL, { type: "open" }).step).toEqual({
      kind: "loading_config",
      openRequested: true,
    });
  });

  it("verifies, mints, connects, and is ready", () => {
    const verifying = run([{ type: "open" }, loaded()]);
    expect(verifying.step).toEqual({ kind: "verifying", reason: "first" });
    expect(verifying.config).toEqual(CONFIG);
    expect(nextAction(verifying)).toEqual({ kind: "verify" });

    const minting = reduce(verifying, { type: "turnstile_solved", token: "ts" });
    expect(nextAction(minting)).toEqual({ kind: "mint", turnstileToken: "ts" });

    const fresh = session();
    const connecting = reduce(minting, { type: "minted", session: fresh });
    expect(connecting.step).toEqual({ kind: "connecting", fresh: true });
    expect(nextAction(connecting)).toEqual({ kind: "connect", session: fresh });

    const ready = reduce(connecting, { type: "socket_open" });
    expect(ready.step).toEqual({ kind: "ready" });
    expect(nextAction(ready)).toEqual({ kind: "none" });
  });
});

describe("restored sessions and expiry", () => {
  it("skips the challenge when storage holds a usable session", () => {
    const stored = session();
    const state = run([{ type: "open" }, loaded(stored)]);
    expect(state.step).toEqual({ kind: "connecting", fresh: false });
    expect(state.session).toBe(stored);
  });

  it("treats a session inside the expiry margin as absent", () => {
    const nearlyExpired = session(NOW + EXPIRY_MARGIN_SECONDS);
    const state = run([{ type: "open" }, loaded(nearlyExpired)]);
    expect(state.step).toEqual({ kind: "verifying", reason: "first" });
    expect(state.session).toBeNull();

    const justUsable = session(NOW + EXPIRY_MARGIN_SECONDS + 1);
    expect(run([{ type: "open" }, loaded(justUsable)]).step).toEqual({
      kind: "connecting",
      fresh: false,
    });
  });

  it("re-verifies once when a restored session is refused, then gives up if the fresh one is too", () => {
    const refusedRestore = run([{ type: "open" }, loaded(session()), { type: "gate_refused" }]);
    expect(refusedRestore.step).toEqual({ kind: "verifying", reason: "expired" });
    expect(refusedRestore.session).toBeNull();
    expect(nextAction(refusedRestore)).toEqual({ kind: "verify" });

    const refusedFresh = run(
      [
        { type: "turnstile_solved", token: "ts" },
        { type: "minted", session: session() },
        { type: "gate_refused" },
      ],
      refusedRestore,
    );
    expect(refusedFresh.step).toEqual({ kind: "refused" });
    expect(refusedFresh.session).toBeNull();
  });

  it("reconnects with the same session after a drop, or re-verifies if it has aged out", () => {
    const ready = run([{ type: "open" }, loaded(session()), { type: "socket_open" }]);
    const dropped = reduce(ready, { type: "socket_closed", now: NOW + 10 });
    expect(dropped.step).toEqual({ kind: "connecting", fresh: false });
    expect(dropped.session).toEqual(ready.session);

    const aged = reduce(ready, { type: "socket_closed", now: NOW + 3600 });
    expect(aged.step).toEqual({ kind: "verifying", reason: "expired" });
    expect(aged.session).toBeNull();
  });

  it("re-verifies when the server closes an open socket as unauthorised", () => {
    const ready = run([{ type: "open" }, loaded(session()), { type: "socket_open" }]);
    const state = reduce(ready, { type: "gate_refused" });
    expect(state.step).toEqual({ kind: "verifying", reason: "expired" });
  });
});

describe("refusal", () => {
  it("is terminal from every gate, with nothing to retry", () => {
    const atConfig = run([{ type: "open" }, { type: "gate_refused" }]);
    const atMint = run([
      { type: "open" },
      loaded(),
      { type: "turnstile_solved", token: "ts" },
      { type: "gate_refused" },
    ]);
    for (const state of [atConfig, atMint]) {
      expect(state.step).toEqual({ kind: "refused" });
      expect(nextAction(state)).toEqual({ kind: "none" });
      for (const event of [{ type: "open" }, { type: "retry" }, { type: "socket_open" }] as const) {
        expect(reduce(state, event)).toBe(state);
      }
    }
  });
});

describe("offline and retry", () => {
  it("backs off exponentially and resumes where it failed", () => {
    const one = run([{ type: "open" }, { type: "network_failed" }]);
    expect(one.step).toEqual({
      kind: "offline",
      resume: "config",
      attempt: 1,
      openRequested: true,
    });
    expect(nextAction(one)).toEqual({ kind: "wait", ms: 1000 });

    const retried = reduce(one, { type: "retry" });
    expect(retried.step).toEqual({ kind: "loading_config", openRequested: true });

    const two = reduce(retried, { type: "network_failed" });
    expect(two.step).toEqual({
      kind: "offline",
      resume: "config",
      attempt: 2,
      openRequested: true,
    });
    expect(nextAction(two)).toEqual({ kind: "wait", ms: 2000 });
  });

  it("keeps the visitor's intent across a config outage, and does not invent one", () => {
    const quiet = run([{ type: "start" }, { type: "network_failed" }]);
    expect(quiet.step).toMatchObject({ kind: "offline", openRequested: false });
    expect(reduce(reduce(quiet, { type: "retry" }), loaded()).step).toEqual({ kind: "configured" });

    const openedWhileDown = reduce(quiet, { type: "open" });
    expect(openedWhileDown.step).toMatchObject({ kind: "offline", openRequested: true });
    expect(reduce(reduce(openedWhileDown, { type: "retry" }), loaded()).step).toEqual({
      kind: "verifying",
      reason: "first",
    });
  });

  it("caps the backoff", () => {
    expect(backoffMs(1)).toBe(1000);
    expect(backoffMs(5)).toBe(16_000);
    expect(backoffMs(6)).toBe(30_000);
    expect(backoffMs(50)).toBe(30_000);
  });

  it("goes back to the challenge, not the mint, when minting fails on the network", () => {
    const state = run([
      { type: "open" },
      loaded(),
      { type: "turnstile_solved", token: "ts" },
      { type: "network_failed" },
      { type: "retry" },
    ]);
    expect(state.step).toEqual({ kind: "verifying", reason: "first" });
  });

  it("retries the challenge when Turnstile itself fails", () => {
    const state = run([{ type: "open" }, loaded(), { type: "turnstile_failed" }]);
    expect(state.step).toMatchObject({ kind: "offline", resume: "verify", attempt: 1 });
  });

  it("keeps the session across a connect retry", () => {
    const stored = session();
    const state = run([
      { type: "open" },
      loaded(stored),
      { type: "network_failed" },
      { type: "retry" },
    ]);
    expect(state.step).toEqual({ kind: "connecting", fresh: false });
    expect(nextAction(state)).toEqual({ kind: "connect", session: stored });
  });

  it("ignores events that do not belong to the current step", () => {
    const offline = run([{ type: "open" }, { type: "network_failed" }]);
    expect(reduce(offline, { type: "socket_open" })).toBe(offline);
    expect(reduce(offline, { type: "minted", session: session() })).toBe(offline);
    const verifying = run([{ type: "open" }, loaded()]);
    expect(reduce(verifying, { type: "socket_closed", now: NOW })).toBe(verifying);
  });
});

describe("connectionView", () => {
  it("collapses every waiting step into connecting and keeps the three the UI acts on", () => {
    expect(connectionView(INITIAL)).toBe("connecting");
    expect(connectionView(run([{ type: "start" }, loaded()]))).toBe("connecting");
    expect(connectionView(run([{ type: "open" }, loaded()]))).toBe("connecting");
    expect(
      connectionView(run([{ type: "open" }, loaded(session()), { type: "socket_open" }])),
    ).toBe("ready");
    expect(connectionView(run([{ type: "open" }, { type: "gate_refused" }]))).toBe("refused");
    expect(connectionView(run([{ type: "open" }, { type: "network_failed" }]))).toBe("offline");
  });
});

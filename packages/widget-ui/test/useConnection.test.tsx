import { newConversationId } from "@cf-chat/shared/ids";
import { err, ok } from "@cf-chat/shared/result";
import type { VisitorSession } from "@cf-chat/shared/widget";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureClient, type WidgetClient } from "../src/embed/client.ts";
import { sessionStore } from "../src/embed/session.ts";
import { FixtureTurnstile } from "../src/embed/turnstile.ts";
import {
  type ConnectionDeps,
  type SocketController,
  useConnection,
} from "../src/embed/useConnection.ts";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.useRealTimers();
});

const NOW = 1_800_000_000;

function recorder(): SocketController & { opened: VisitorSession[]; closed: number } {
  const log = {
    opened: [] as VisitorSession[],
    closed: 0,
    open(session: VisitorSession) {
      log.opened.push(session);
    },
    close() {
      log.closed += 1;
    },
  };
  return log;
}

function harness(overrides: Partial<ConnectionDeps> & { client?: WidgetClient } = {}) {
  const socket = recorder();
  const turnstile = new FixtureTurnstile("ts-token");
  const store = sessionStore("wk_test");
  const deps: ConnectionDeps = {
    client: fixtureClient(),
    turnstile,
    store,
    turnstileContainer: () => document.createElement("div"),
    socket,
    now: () => NOW,
    ...overrides,
  };
  const hook = renderHook(() => useConnection(deps));
  return { ...hook, socket, turnstile, store };
}

describe("useConnection", () => {
  it("loads config at mount, then on open runs challenge, mint, connect", async () => {
    const { result, socket, turnstile, store } = harness();
    await waitFor(() => expect(result.current.state.step.kind).toBe("configured"));
    expect(turnstile.calls).toEqual([]);
    expect(socket.opened).toHaveLength(0);

    act(() => result.current.open());
    await waitFor(() => expect(result.current.state.step.kind).toBe("connecting"));

    expect(turnstile.calls).toEqual(["0x-fixture"]);
    expect(socket.opened).toHaveLength(1);
    expect(store.load()?.token).toBe("fixture-token");
    expect(result.current.state.config?.scope.tenantName).toBe("Acme");

    act(() => result.current.dispatch({ type: "socket_open" }));
    expect(result.current.state.step.kind).toBe("ready");
  });

  it("skips the challenge when a usable session is stored", async () => {
    const { result, socket, turnstile, store } = harness();
    const stored: VisitorSession = {
      token: "stored",
      conversationId: newConversationId(),
      expiresAt: NOW + 3600,
    };
    store.save(stored);

    act(() => result.current.open());
    await waitFor(() => expect(socket.opened).toHaveLength(1));
    expect(turnstile.calls).toEqual([]);
    expect(socket.opened[0]?.token).toBe("stored");
  });

  it("clears storage and re-challenges when a restored session is refused by the socket", async () => {
    const { result, socket, turnstile, store } = harness();
    store.save({ token: "stale", conversationId: newConversationId(), expiresAt: NOW + 3600 });

    act(() => result.current.open());
    await waitFor(() => expect(socket.opened).toHaveLength(1));

    act(() => result.current.dispatch({ type: "gate_refused" }));
    await waitFor(() => expect(socket.opened).toHaveLength(2));
    expect(turnstile.calls).toEqual(["0x-fixture"]);
    expect(socket.opened[1]?.token).toBe("fixture-token");
    expect(store.load()?.token).toBe("fixture-token");
  });

  it("stops and closes the socket on a refusal from the config gate", async () => {
    const { result, socket } = harness({
      client: fixtureClient({ fetchConfig: async () => err({ kind: "refused" }) }),
    });
    act(() => result.current.open());
    await waitFor(() => expect(result.current.state.step.kind).toBe("refused"));
    expect(socket.closed).toBe(1);
    expect(socket.opened).toHaveLength(0);
  });

  it("retries after backoff when the network fails", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const client = fixtureClient({
      fetchConfig: async () => {
        attempts += 1;
        return attempts === 1
          ? err({ kind: "network" })
          : ok({ turnstileSiteKey: "0x", scope: { tenantName: "Acme" } });
      },
    });
    const { result, turnstile } = harness({ client });

    // The mount-time fetch fails.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.state.step).toMatchObject({ kind: "offline", attempt: 1 });

    // Opening while offline is remembered, not dropped.
    act(() => result.current.open());
    expect(result.current.state.step).toMatchObject({ kind: "offline", openRequested: true });

    await act(async () => {
      vi.advanceTimersByTime(999);
    });
    expect(attempts).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(attempts).toBe(2);
    await act(async () => {
      await Promise.resolve();
    });
    expect(turnstile.calls).toHaveLength(1);
  });

  it("goes back to the challenge when minting fails on the network", async () => {
    let mints = 0;
    const client = fixtureClient({
      mintSession: async () => {
        mints += 1;
        return err({ kind: "network" });
      },
    });
    const { result, turnstile } = harness({ client });
    act(() => result.current.open());
    await waitFor(() => expect(result.current.state.step.kind).toBe("offline"));
    expect(mints).toBe(1);
    expect(result.current.state.step).toMatchObject({ resume: "verify" });
    expect(turnstile.calls).toHaveLength(1);
  });
});

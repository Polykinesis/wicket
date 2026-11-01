import type { PageContext, VisitorSession, WidgetPublicConfig } from "@cf-chat/shared/widget";
import { useAgentChat } from "agents/chat/react";
import { useAgent } from "agents/react";
import { useCallback, useMemo, useRef } from "react";
import { buildTurns, type TurnView } from "../turn.ts";
import type { WidgetClient } from "./client.ts";
import type { ConnectionState } from "./connection.ts";
import { currentPage } from "./page.ts";
import type { SessionStore } from "./session.ts";
import type { TurnstileChallenge } from "./turnstile.ts";
import { type SocketController, useConnection } from "./useConnection.ts";

export interface WidgetChatOptions {
  readonly siteKey: string;
  readonly client: WidgetClient;
  readonly turnstile: TurnstileChallenge;
  readonly store: SessionStore;
  readonly turnstileContainer: () => HTMLElement;
  /** Config the loader already fetched, so the embed does not fetch it again. */
  readonly initialConfig?: WidgetPublicConfig | undefined;
}

export interface WidgetChat {
  readonly connection: ConnectionState;
  readonly turns: readonly TurnView[];
  readonly page: PageContext | null;
  /** Start connecting. Called when the panel opens; idempotent. */
  readonly open: () => void;
  readonly ask: (text: string) => void;
}

/** Close codes the agents client treats as terminal: it will not reconnect. */
const isTerminalClose = (code: number): boolean => code === 1008 || (code >= 4000 && code <= 4999);

/**
 * The chat hook for the embed: `useConnection` decides when a socket may
 * open, `useAgent` owns the socket, `useAgentChat` owns the messages.
 *
 * Reconnection is the machine's, not PartySocket's (`maxRetries: 0`): the
 * machine knows about token expiry and gate refusal, PartySocket does not,
 * and two reconnect loops would fight. The socket starts closed and is only
 * opened by a `connect` action. The token travels as a query parameter
 * because `WebSocket` lets a browser set no headers; the widget Worker moves
 * it into a header for the hop to `app` (ADR-016).
 *
 * `getInitialMessages: null` because the widget Worker has no HTTP route for
 * message history; the agent sends it over the socket on connect.
 */
export function useWidgetChat(options: WidgetChatOptions): WidgetChat {
  const { siteKey, client, turnstile, store, turnstileContainer, initialConfig } = options;

  // The socket controller must exist before `useAgent` runs, and the agent
  // must exist before the controller can act. A ref closes the loop.
  const agentRef = useRef<{ reconnect(): void; close(): void } | null>(null);
  // The session is written here before `reconnect()` can ask for it, and the
  // reconnect itself waits a microtask. `useConnection`'s effect (which calls
  // `open`) runs before `useAgent`'s own effect has pushed the new query into
  // the socket; a reconnect issued synchronously would carry the previous
  // token, or none. A microtask runs after the whole effect flush.
  const sessionRef = useRef<VisitorSession | null>(null);
  const socket = useMemo<SocketController>(
    () => ({
      open: (session) => {
        sessionRef.current = session;
        queueMicrotask(() => agentRef.current?.reconnect());
      },
      close: () => agentRef.current?.close(),
    }),
    [],
  );

  const { state, dispatch, open } = useConnection({
    client,
    turnstile,
    store,
    turnstileContainer,
    socket,
    ...(initialConfig ? { initialConfig } : {}),
  });

  sessionRef.current = state.session;

  const socketUrl = useMemo(() => client.socketUrl(), [client]);

  const agent = useAgent({
    agent: "conversation",
    basePath: socketUrl.pathname.replace(/^\//, ""),
    host: socketUrl.host,
    protocol: socketUrl.protocol === "ws:" ? "ws" : "wss",
    startClosed: true,
    maxRetries: 0,
    // Cached per token (`queryDeps`), so a new session is a new query and a
    // reconnect with the same session reuses the answer. Not `cacheTtl: 0`:
    // the hook resolves the query with `use()`, and an always-expired cache
    // suspends every render.
    query: async () => ({ k: siteKey, t: sessionRef.current?.token ?? null }),
    queryDeps: [state.session?.token ?? null],
    onOpen: () => dispatch({ type: "socket_open" }),
    onClose: (event) => {
      // A terminal close is reported through onConnectionError; dispatching
      // both would let `socket_closed` move the step before `gate_refused`
      // is seen.
      if (!isTerminalClose(event.code)) {
        dispatch({ type: "socket_closed", now: Math.floor(Date.now() / 1000) });
      }
    },
    onConnectionError: () => dispatch({ type: "gate_refused" }),
  });
  agentRef.current = agent;

  const { messages, status, sendMessage } = useAgentChat({ agent, getInitialMessages: null });

  const turns = useMemo(() => buildTurns(messages, status), [messages, status]);
  const page = useMemo(() => currentPage(), []);

  const ask = useCallback(
    (text: string) => {
      const context = currentPage();
      void sendMessage({ text, metadata: context ? { page: context } : undefined });
    },
    [sendMessage],
  );

  return { connection: state, turns, page, open, ask };
}

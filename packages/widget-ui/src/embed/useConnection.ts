import type { VisitorSession, WidgetPublicConfig } from "@cf-chat/shared/widget";
import { useCallback, useEffect, useReducer, useRef } from "react";
import type { WidgetClient } from "./client.ts";
import {
  type ConnectionEvent,
  type ConnectionState,
  INITIAL,
  nextAction,
  reduce,
} from "./connection.ts";
import type { SessionStore } from "./session.ts";
import type { TurnstileChallenge } from "./turnstile.ts";

/**
 * The socket, as the connection effects see it. `useWidgetChat` backs this
 * with the `useAgent` socket; tests back it with a recorder.
 */
export interface SocketController {
  open(session: VisitorSession): void;
  close(): void;
}

export interface ConnectionDeps {
  readonly client: WidgetClient;
  readonly turnstile: TurnstileChallenge;
  readonly store: SessionStore;
  /** The light-DOM element Turnstile renders into. Resolved late: it may not exist at mount. */
  readonly turnstileContainer: () => HTMLElement;
  readonly socket: SocketController;
  /**
   * Config the loader already fetched to draw the launcher. Skips the fetch
   * here; the machine starts configured.
   */
  readonly initialConfig?: WidgetPublicConfig;
  /** Unix seconds. Injected for tests. */
  readonly now?: () => number;
}

export interface Connection {
  readonly state: ConnectionState;
  readonly dispatch: (event: ConnectionEvent) => void;
  /** The visitor wants a conversation. Idempotent. */
  readonly open: () => void;
}

/**
 * Runs the connection machine: `reduce` decides, `nextAction` says what to
 * do, and this hook does it. Every side effect (fetch, Turnstile, mint,
 * storage, timers, socket) is behind an injected dependency, so the whole
 * flow runs under happy-dom with fixtures.
 *
 * Effects key on the step, not on the whole state, and each one is cancelled
 * by its cleanup: a result that lands after the step has moved on is
 * dropped here as well as ignored by the reducer. Under React's development
 * double-invoke the first run's work is wasted but harmless.
 */
export function useConnection(deps: ConnectionDeps): Connection {
  const [state, dispatch] = useReducer(reduce, INITIAL);

  // The effects read deps through a ref so a caller passing a fresh object
  // each render does not restart in-flight work.
  const depsRef = useRef(deps);
  depsRef.current = deps;

  // Config is needed at mount: the launcher's label and the brand colour come
  // from it. The loader usually has it already; otherwise fetch. Everything
  // else waits for `open`.
  useEffect(() => {
    const d = depsRef.current;
    if (d.initialConfig) {
      const now = d.now ?? (() => Math.floor(Date.now() / 1000));
      dispatch({
        type: "start",
        preloaded: { config: d.initialConfig, stored: d.store.load(), now: now() },
      });
    } else {
      dispatch({ type: "start" });
    }
  }, []);

  const { step, config, session } = state;

  useEffect(() => {
    const d = depsRef.current;
    const now = d.now ?? (() => Math.floor(Date.now() / 1000));
    let live = true;
    const send = (event: ConnectionEvent) => {
      if (live) {
        dispatch(event);
      }
    };

    const action = nextAction({ step, config, session, failures: 0 });
    switch (action.kind) {
      case "none":
        if (step.kind === "refused") {
          d.socket.close();
        }
        return;

      case "fetch_config":
        void d.client.fetchConfig().then((result) => {
          if (result.ok) {
            send({
              type: "config_loaded",
              config: result.value,
              stored: d.store.load(),
              now: now(),
            });
          } else {
            send({ type: result.error.kind === "refused" ? "gate_refused" : "network_failed" });
          }
        });
        return () => {
          live = false;
        };

      case "verify": {
        if (step.kind === "verifying" && step.reason === "expired") {
          d.store.clear();
        }
        if (!config) {
          // Cannot happen: the reducer only enters verifying after config_loaded.
          send({ type: "network_failed" });
          return;
        }
        d.turnstile.solve(config.turnstileSiteKey, d.turnstileContainer()).then(
          (token) => send({ type: "turnstile_solved", token }),
          () => send({ type: "turnstile_failed" }),
        );
        return () => {
          live = false;
        };
      }

      case "mint":
        void d.client.mintSession(action.turnstileToken).then((result) => {
          if (result.ok) {
            d.store.save(result.value);
            send({ type: "minted", session: result.value });
          } else {
            send({ type: result.error.kind === "refused" ? "gate_refused" : "network_failed" });
          }
        });
        return () => {
          live = false;
        };

      case "connect":
        d.socket.open(action.session);
        return;

      case "wait": {
        const timer = setTimeout(() => send({ type: "retry" }), action.ms);
        return () => {
          live = false;
          clearTimeout(timer);
        };
      }

      default:
        return assertNever(action);
    }
  }, [step, config, session]);

  const open = useCallback(() => dispatch({ type: "open" }), []);

  return { state, dispatch, open };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled action ${JSON.stringify(value)}`);
}

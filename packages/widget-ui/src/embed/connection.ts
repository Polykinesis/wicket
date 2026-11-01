import type { VisitorSession, WidgetPublicConfig } from "@cf-chat/shared/widget";

/**
 * The embed's connection lifecycle as a pure state machine. Effects (fetching,
 * Turnstile, the socket, storage, timers) live in `useConnection`; this file
 * only decides what state follows an event and what to do next, so every
 * path is a table-driven test rather than a browser session.
 *
 * Config loads at mount, because the launcher's label and the brand colour
 * come from it. Everything that costs the visitor or the server (the
 * challenge, the token, the socket, the Durable Object behind it) waits
 * until the panel is opened.
 *
 * Two decisions here are the ones that read fine and are wrong if rushed.
 *
 * The gates all answer the same refusal, by design (ADR-016), so a refused
 * socket cannot say whether the site is not allowed or the token merely
 * expired. The machine disambiguates by provenance: a refusal with a token
 * restored from storage is treated as expiry and re-verified once; a refusal
 * with a token minted in this very cycle is a real refusal and terminal. That
 * gives one retry on expiry and no retry loop on refusal.
 *
 * A Turnstile token is single use. A network failure while minting may or may
 * not have spent it, so the retry goes back to the challenge, not to the mint.
 */

/** A session this close to expiry is dropped rather than presented. */
export const EXPIRY_MARGIN_SECONDS = 60;

export type Step =
  | { readonly kind: "idle" }
  /** `openRequested` remembers a visitor who opened the panel before config arrived. */
  | { readonly kind: "loading_config"; readonly openRequested: boolean }
  /** Config in hand, panel not yet opened. The launcher can render. */
  | { readonly kind: "configured" }
  /** Turnstile is running; `reason` says whether this is first contact or a re-verify. */
  | { readonly kind: "verifying"; readonly reason: "first" | "expired" }
  | { readonly kind: "minting"; readonly turnstileToken: string }
  /** `fresh` is true when the session was minted this cycle rather than restored. */
  | { readonly kind: "connecting"; readonly fresh: boolean }
  | { readonly kind: "ready" }
  /** Terminal. The site key, origin or challenge was refused; nothing to retry. */
  | { readonly kind: "refused" }
  /**
   * A network failure. `resume` names the step a retry goes back to;
   * `openRequested` carries the visitor's intent across the wait.
   */
  | {
      readonly kind: "offline";
      readonly resume: Resume;
      readonly attempt: number;
      readonly openRequested: boolean;
    };

export type Resume = "config" | "verify" | "connect";

export interface ConnectionState {
  readonly config: WidgetPublicConfig | null;
  readonly session: VisitorSession | null;
  readonly step: Step;
  /** Consecutive network failures, so backoff keeps growing across retries. Reset on progress. */
  readonly failures: number;
}

export const INITIAL: ConnectionState = {
  config: null,
  session: null,
  step: { kind: "idle" },
  failures: 0,
};

export type ConnectionEvent =
  /** The embed mounted: load config. */
  | { readonly type: "start" }
  /** The visitor wants a conversation: the panel opened. */
  | { readonly type: "open" }
  /** `/config` answered. `stored` is whatever storage held, checked here. */
  | {
      readonly type: "config_loaded";
      readonly config: WidgetPublicConfig;
      readonly stored: VisitorSession | null;
      readonly now: number;
    }
  | { readonly type: "turnstile_solved"; readonly token: string }
  | { readonly type: "turnstile_failed" }
  | { readonly type: "minted"; readonly session: VisitorSession }
  /** A gate refused, on any of the three routes. */
  | { readonly type: "gate_refused" }
  /** A request threw or returned 5xx, or the socket errored before opening. */
  | { readonly type: "network_failed" }
  | { readonly type: "socket_open" }
  /** A socket that had been open closed. */
  | { readonly type: "socket_closed"; readonly now: number }
  /** The backoff timer fired. */
  | { readonly type: "retry" };

export type Action =
  | { readonly kind: "none" }
  | { readonly kind: "fetch_config" }
  | { readonly kind: "verify" }
  | { readonly kind: "mint"; readonly turnstileToken: string }
  | { readonly kind: "connect"; readonly session: VisitorSession }
  | { readonly kind: "wait"; readonly ms: number };

export function isUsable(session: VisitorSession, now: number): boolean {
  return session.expiresAt - now > EXPIRY_MARGIN_SECONDS;
}

export function reduce(state: ConnectionState, event: ConnectionEvent): ConnectionState {
  const { step } = state;
  switch (step.kind) {
    case "idle":
      switch (event.type) {
        case "start":
          return { ...state, step: { kind: "loading_config", openRequested: false } };
        case "open":
          return { ...state, step: { kind: "loading_config", openRequested: true } };
        default:
          return state;
      }

    case "loading_config":
      switch (event.type) {
        case "open":
          return step.openRequested
            ? state
            : { ...state, step: { kind: "loading_config", openRequested: true } };
        case "config_loaded": {
          const session = event.stored && isUsable(event.stored, event.now) ? event.stored : null;
          const configured: ConnectionState = {
            config: event.config,
            session,
            failures: 0,
            step: { kind: "configured" },
          };
          return step.openRequested ? begin(configured) : configured;
        }
        case "gate_refused":
          return { ...state, step: { kind: "refused" } };
        case "network_failed":
          return offline(state, "config", step.openRequested);
        default:
          return state;
      }

    case "configured":
      return event.type === "open" ? begin(state) : state;

    case "verifying":
      switch (event.type) {
        case "turnstile_solved":
          return { ...state, failures: 0, step: { kind: "minting", turnstileToken: event.token } };
        case "turnstile_failed":
          return offline(state, "verify");
        default:
          return state;
      }

    case "minting":
      switch (event.type) {
        case "minted":
          return {
            ...state,
            session: event.session,
            failures: 0,
            step: { kind: "connecting", fresh: true },
          };
        case "gate_refused":
          return { ...state, session: null, step: { kind: "refused" } };
        case "network_failed":
          // The challenge token may have been spent; a retry needs a new one.
          return offline(state, "verify");
        default:
          return state;
      }

    case "connecting":
      switch (event.type) {
        case "socket_open":
          return { ...state, failures: 0, step: { kind: "ready" } };
        case "gate_refused":
          return step.fresh
            ? { ...state, session: null, step: { kind: "refused" } }
            : { ...state, session: null, step: { kind: "verifying", reason: "expired" } };
        case "network_failed":
        case "socket_closed":
          return offline(state, "connect");
        default:
          return state;
      }

    case "ready":
      switch (event.type) {
        case "socket_closed":
          return state.session && isUsable(state.session, event.now)
            ? { ...state, step: { kind: "connecting", fresh: false } }
            : { ...state, session: null, step: { kind: "verifying", reason: "expired" } };
        case "gate_refused":
          // The server closed an open socket as unauthorised: the token aged
          // out mid-conversation. Same path as a refused restore.
          return { ...state, session: null, step: { kind: "verifying", reason: "expired" } };
        default:
          return state;
      }

    case "refused":
      return state;

    case "offline":
      if (event.type === "open") {
        return step.openRequested ? state : { ...state, step: { ...step, openRequested: true } };
      }
      if (event.type !== "retry") {
        return state;
      }
      switch (step.resume) {
        case "config":
          return { ...state, step: { kind: "loading_config", openRequested: step.openRequested } };
        case "verify":
          return { ...state, session: null, step: { kind: "verifying", reason: "first" } };
        case "connect":
          return state.session
            ? { ...state, step: { kind: "connecting", fresh: false } }
            : { ...state, step: { kind: "verifying", reason: "first" } };
        default:
          return assertNever(step.resume);
      }

    default:
      return assertNever(step);
  }
}

/** From `configured` to the first step that needs the visitor: connect if a session survived, else challenge. */
function begin(state: ConnectionState): ConnectionState {
  return {
    ...state,
    step: state.session
      ? { kind: "connecting", fresh: false }
      : { kind: "verifying", reason: "first" },
  };
}

function offline(state: ConnectionState, resume: Resume, openRequested = true): ConnectionState {
  const failures = state.failures + 1;
  return {
    ...state,
    failures,
    step: { kind: "offline", resume, attempt: failures, openRequested },
  };
}

/** 1s, 2s, 4s ... capped at 30s. */
export function backoffMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1));
}

export function nextAction(state: ConnectionState): Action {
  const { step } = state;
  switch (step.kind) {
    case "idle":
    case "configured":
    case "ready":
    case "refused":
      return { kind: "none" };
    case "loading_config":
      return { kind: "fetch_config" };
    case "verifying":
      return { kind: "verify" };
    case "minting":
      return { kind: "mint", turnstileToken: step.turnstileToken };
    case "connecting":
      return state.session ? { kind: "connect", session: state.session } : { kind: "verify" };
    case "offline":
      return { kind: "wait", ms: backoffMs(step.attempt) };
    default:
      return assertNever(step);
  }
}

/**
 * What the UI needs to know, and nothing about how it got there. `connecting`
 * covers the challenge and the mint as well as the socket: to a visitor they
 * are one wait.
 */
export type ConnectionView = "ready" | "connecting" | "offline" | "refused";

export function connectionView(state: ConnectionState): ConnectionView {
  switch (state.step.kind) {
    case "ready":
      return "ready";
    case "refused":
      return "refused";
    case "offline":
      return "offline";
    case "idle":
    case "loading_config":
    case "configured":
    case "verifying":
    case "minting":
    case "connecting":
      return "connecting";
    default:
      return assertNever(state.step);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled connection step ${JSON.stringify(value)}`);
}

/**
 * The Turnstile challenge, client side. An interface with a fixture so the
 * connection flow is testable without `challenges.cloudflare.com`.
 *
 * `appearance: "interaction-only"` keeps the widget invisible unless Turnstile
 * decides the visitor must interact, which for most people is never. The
 * container is a light-DOM child of the host element rather than anything in
 * the shadow root: Turnstile's behaviour inside a shadow root is unverified
 * and a plain div outside it sidesteps the question (plan, Phase 2).
 */
export interface TurnstileChallenge {
  /** Resolves with a one-time token; rejects when the challenge errored or timed out. */
  solve(siteKey: string, container: HTMLElement): Promise<string>;
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** The subset of Turnstile's global we use. The real one has more. */
interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      appearance: "always" | "execute" | "interaction-only";
      callback: (token: string) => void;
      "error-callback": (code?: string) => void;
      "expired-callback": () => void;
    },
  ): string | undefined;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi | undefined;
  }
}

let scriptLoad: Promise<TurnstileApi> | null = null;

/** Loads the Turnstile script once per page, shared by every solve. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }
  if (!scriptLoad) {
    scriptLoad = new Promise<TurnstileApi>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        if (window.turnstile) {
          resolve(window.turnstile);
        } else {
          reject(new Error("Turnstile script loaded but exposed no API"));
        }
      };
      script.onerror = () => {
        scriptLoad = null; // Let the next solve try again.
        reject(new Error("Turnstile script failed to load"));
      };
      document.head.append(script);
    });
  }
  return scriptLoad;
}

export class ScriptTurnstile implements TurnstileChallenge {
  async solve(siteKey: string, container: HTMLElement): Promise<string> {
    const turnstile = await loadTurnstile();
    return new Promise<string>((resolve, reject) => {
      let widgetId: string | undefined;
      const done = () => {
        if (widgetId !== undefined) {
          turnstile.remove(widgetId);
        }
      };
      widgetId = turnstile.render(container, {
        sitekey: siteKey,
        appearance: "interaction-only",
        callback: (token) => {
          done();
          resolve(token);
        },
        "error-callback": (code) => {
          done();
          reject(new Error(`Turnstile error${code ? ` ${code}` : ""}`));
        },
        "expired-callback": () => {
          // The token expired before we used it. Treat as a failure; the
          // caller's retry renders a fresh challenge.
          done();
          reject(new Error("Turnstile token expired before use"));
        },
      });
      if (widgetId === undefined) {
        reject(new Error("Turnstile did not render"));
      }
    });
  }
}

/** Resolves or rejects immediately, as configured. */
export class FixtureTurnstile implements TurnstileChallenge {
  readonly calls: string[] = [];
  readonly #outcome: string | Error;

  constructor(outcome: string | Error = "fixture-turnstile-token") {
    this.#outcome = outcome;
  }

  async solve(siteKey: string, _container: HTMLElement): Promise<string> {
    this.calls.push(siteKey);
    if (this.#outcome instanceof Error) {
      throw this.#outcome;
    }
    return this.#outcome;
  }
}

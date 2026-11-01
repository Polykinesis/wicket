/**
 * The Turnstile seam.
 *
 * An interface with a fixture, following the rule that tests use fixture
 * implementations and never live bindings, the same way `Retriever`,
 * `Generator` and `Indexer` are treated. Without it every test of the gate
 * would have to reach `challenges.cloudflare.com`, which would make the gate
 * effectively untested.
 */

/**
 * What siteverify said. `hostname` is the page the challenge was solved on,
 * as Turnstile saw it; the gate compares it with the request's Origin so a
 * token solved on one allowlisted site cannot be presented from another.
 * Null only when the response carried none, which the fixture uses.
 */
export type TurnstileOutcome =
  | { readonly solved: true; readonly hostname: string | null }
  | { readonly solved: false };

export interface TurnstileVerifier {
  /** Whether the token is a genuine, unspent solve for this site, and where it was solved. */
  verify(token: string, remoteIp: string | null): Promise<TurnstileOutcome>;
}

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** The real one. */
export class CloudflareTurnstile implements TurnstileVerifier {
  readonly #secret: string;

  constructor(secret: string) {
    this.#secret = secret;
  }

  async verify(token: string, remoteIp: string | null): Promise<TurnstileOutcome> {
    const body = new FormData();
    body.append("secret", this.#secret);
    body.append("response", token);
    if (remoteIp) {
      body.append("remoteip", remoteIp);
    }

    try {
      const response = await fetch(SITEVERIFY_URL, { method: "POST", body });
      if (!response.ok) {
        return { solved: false };
      }
      const outcome: unknown = await response.json();
      if (typeof outcome !== "object" || outcome === null) {
        return { solved: false };
      }
      const { success, hostname } = outcome as { success?: unknown; hostname?: unknown };
      if (success !== true) {
        return { solved: false };
      }
      return { solved: true, hostname: typeof hostname === "string" ? hostname : null };
    } catch (cause) {
      // Fail closed. An unreachable siteverify is indistinguishable from one
      // that would have refused, and this gate is the reason the visitor token
      // means anything (ADR-016).
      console.error("Turnstile siteverify failed", cause);
      return { solved: false };
    }
  }
}

/** Answers however it was told to, so a test can assert both sides of the gate. */
export class FixtureTurnstile implements TurnstileVerifier {
  readonly seen: { token: string; remoteIp: string | null }[] = [];
  readonly #outcome: TurnstileOutcome;

  constructor(solved = true, hostname: string | null = null) {
    this.#outcome = solved ? { solved: true, hostname } : { solved: false };
  }

  async verify(token: string, remoteIp: string | null): Promise<TurnstileOutcome> {
    this.seen.push({ token, remoteIp });
    return this.#outcome;
  }
}

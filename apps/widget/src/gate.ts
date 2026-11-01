import {
  conversationAgentName,
  isAllowedOrigin,
  newConversationId,
  newVisitorId,
  signVisitorToken,
  type VisitorEnvelope,
  verifyVisitorToken,
  visitorTokenExpiry,
  type WidgetConfig,
  type WidgetSiteKey,
  widgetConfigKvKey,
  widgetConfigSchema,
  widgetSiteKeySchema,
} from "@cf-chat/shared";
import type { TurnstileVerifier } from "./turnstile.ts";

/**
 * Why a request was refused.
 *
 * Kept as a union so the Worker can log which gate closed while still telling
 * the caller nothing but 403. Distinguishing them on the wire would let someone
 * enumerate valid site keys by watching the reason change.
 */
export type GateRefusal =
  | "unknown_site_key"
  | "origin_not_allowed"
  | "turnstile_failed"
  | "invalid_token";

export type GateResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly refusal: GateRefusal };

/** Everything the gates need, passed in so tests supply fixtures (CLAUDE.md). */
export interface GateDeps {
  readonly kv: KVNamespace;
  readonly turnstile: TurnstileVerifier;
  readonly tokenSecret: string;
}

/**
 * Look up a site key's config.
 *
 * Parsed with zod on the way out of KV rather than trusted. KV is our own
 * store, but it is still a boundary, and a config written by an older version
 * of the dashboard is exactly the shape that would otherwise fail somewhere
 * less obvious.
 */
export async function readConfig(
  deps: GateDeps,
  rawSiteKey: string | null,
): Promise<GateResult<{ siteKey: WidgetSiteKey; config: WidgetConfig }>> {
  const siteKey = widgetSiteKeySchema.safeParse(rawSiteKey ?? "");
  if (!siteKey.success) {
    return { ok: false, refusal: "unknown_site_key" };
  }

  const stored = await deps.kv.get(widgetConfigKvKey(siteKey.data), "json");
  const config = widgetConfigSchema.safeParse(stored);
  if (!config.success) {
    return { ok: false, refusal: "unknown_site_key" };
  }
  return { ok: true, value: { siteKey: siteKey.data, config: config.data } };
}

/**
 * Mint a visitor token: the `POST /session` path.
 *
 * The order is the security property. Site key, then origin, then Turnstile,
 * and only then a signature. A token minted before the Turnstile check would
 * prove nothing but a plausible `Origin` header, and `Origin` is only a header
 * once you are outside a browser (ADR-016).
 *
 * The conversation and visitor ids are minted here rather than accepted from
 * the caller, so the signature covers ids the client never chose. That is what
 * stops a visitor asking for a token that addresses somebody else's
 * conversation.
 */
export async function mintSession(
  deps: GateDeps,
  request: Request,
  turnstileToken: string | null,
): Promise<GateResult<{ token: string; envelope: VisitorEnvelope }>> {
  const config = await readConfig(deps, new URL(request.url).searchParams.get("k"));
  if (!config.ok) {
    return config;
  }
  const origin = request.headers.get("origin");
  if (origin === null || !isAllowedOrigin(config.value.config, origin)) {
    return { ok: false, refusal: "origin_not_allowed" };
  }
  if (!turnstileToken) {
    console.warn("Turnstile token missing from the session request");
    return { ok: false, refusal: "turnstile_failed" };
  }

  const solved = await deps.turnstile.verify(
    turnstileToken,
    request.headers.get("cf-connecting-ip"),
  );
  if (!solved.solved) {
    return { ok: false, refusal: "turnstile_failed" };
  }
  // The challenge was solved on a page; that page must be the one asking.
  // Without this, a token solved on one allowlisted site could be presented
  // with another allowlisted site's Origin header from outside a browser.
  // Cloudflare's test keys answer with a fixed dummy hostname and only ever
  // verify against test secrets, so they are exempt rather than unusable.
  const expected = new URL(origin).hostname;
  if (
    solved.hostname !== null &&
    solved.hostname !== expected &&
    !isTurnstileTestKey(config.value.config.turnstileSiteKey)
  ) {
    console.warn("Turnstile solved on another host", { solved: solved.hostname, expected });
    return { ok: false, refusal: "turnstile_failed" };
  }

  const envelope: VisitorEnvelope = {
    tenantId: config.value.config.tenantId,
    conversationId: newConversationId(),
    visitorId: newVisitorId(),
    exp: visitorTokenExpiry(),
  };
  return {
    ok: true,
    value: { token: await signVisitorToken(envelope, deps.tokenSecret), envelope },
  };
}

/**
 * Cloudflare's documented dummy site keys (`1x…AA`, `1x…BB`, `2x…`, `3x…FF`).
 * Their tokens validate only with the matching dummy secrets, so a production
 * secret can never be fooled by one; the exemption is about dev ergonomics,
 * not trust.
 */
export function isTurnstileTestKey(siteKey: string): boolean {
  return /^[123]x0{20}[A-Z]{2}$/.test(siteKey);
}

/**
 * Admit a socket: the `GET /chat` path.
 *
 * No Turnstile here, deliberately. The token already carries the proof that one
 * was solved, which is what lets a visitor reload the page or survive a dropped
 * connection without being challenged again. The token's own expiry is what
 * bounds that.
 *
 * The token's tenant is checked against the site key's tenant so a token minted
 * through one tenant's widget cannot be replayed through another's, even though
 * both would verify against the same signing secret.
 */
export async function admitSocket(
  deps: GateDeps,
  request: Request,
  token: string | null,
): Promise<GateResult<{ envelope: VisitorEnvelope; agentName: string }>> {
  const config = await readConfig(deps, new URL(request.url).searchParams.get("k"));
  if (!config.ok) {
    return config;
  }
  if (!isAllowedOrigin(config.value.config, request.headers.get("origin"))) {
    return { ok: false, refusal: "origin_not_allowed" };
  }
  if (!token) {
    return { ok: false, refusal: "invalid_token" };
  }

  const envelope = await verifyVisitorToken(token, deps.tokenSecret);
  if (!envelope) {
    return { ok: false, refusal: "invalid_token" };
  }
  if (envelope.tenantId !== config.value.config.tenantId) {
    return { ok: false, refusal: "invalid_token" };
  }

  return {
    ok: true,
    value: {
      envelope,
      agentName: conversationAgentName(envelope.tenantId, envelope.conversationId),
    },
  };
}

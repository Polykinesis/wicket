import { z } from "zod";
import { type TenantId, tenantIdSchema } from "./ids.ts";

/**
 * The public identifier a tenant pastes into their site.
 *
 * Public by definition: it ships in the embed snippet on someone else's page,
 * so it identifies a tenant and authorises nothing on its own. The origin
 * allowlist and Turnstile are what stand between it and a conversation.
 *
 * Prefixed so a leaked one is recognisable in a log or a bug report, and so it
 * cannot be confused with a uuid from `ids.ts`, which is the shape everything
 * else in this codebase uses for identity.
 */
export type WidgetSiteKey = string & { readonly __brand: "WidgetSiteKey" };

const SITE_KEY_PREFIX = "wk_";

export const widgetSiteKeySchema = z
  .string()
  .regex(/^wk_[0-9a-f]{32}$/)
  .transform((value) => value as WidgetSiteKey);

export function newWidgetSiteKey(): WidgetSiteKey {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${SITE_KEY_PREFIX}${hex}` as WidgetSiteKey;
}

/**
 * What the widget knows about its own knowledge, for the header and the empty
 * state. Proves "answers only from what you published" instead of claiming it.
 *
 * Everything except the tenant name is optional, and each missing field hides
 * its piece of UI rather than showing a placeholder. `documentCount` and
 * `updatedAt` are computed from the sources table when the config is
 * projected; the rest is set by the tenant in settings.
 */
export const widgetScopeSchema = z.object({
  tenantName: z.string().min(1).max(80),
  /** Ready sources. Counted as documents until website ingestion exists. */
  documentCount: z.number().int().nonnegative().optional(),
  /** ISO timestamp of the most recent successful index. */
  updatedAt: z.iso.datetime({ offset: true }).optional(),
  topics: z.array(z.string().min(1).max(32)).max(8).optional(),
  /** Real top-asked questions. Absent until a tenant has enough of them. */
  suggestedQuestions: z.array(z.string().min(1).max(140)).max(5).optional(),
  /** Who a handoff goes to, as the visitor should read it: "Sam", "the team". */
  ownerName: z.string().min(1).max(60).optional(),
  /** Free text such as "within 4 hours". Never computed, so never wrong. */
  replyTime: z.string().min(1).max(60).optional(),
});
export type WidgetScope = z.infer<typeof widgetScopeSchema>;

/**
 * Six-digit hex only. Shorthand, named colours and functional notation are
 * refused because this value lands in a `style` attribute on a stranger's page
 * and a strict grammar is the cheapest way to keep it inert.
 */
export const brandColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/**
 * Everything the `widget` Worker and the embed need per site key: the gate
 * (origins, Turnstile), what the panel says about itself (`scope`) and the one
 * white-label dial (`brandColor`).
 *
 * Lives in KV, which `CLAUDE.md` sanctions for widget config specifically. The
 * no-read-after-write rule applies with teeth here: a tenant who adds an origin
 * in the dashboard will not see it take effect immediately, so the dashboard
 * must never save an origin and then verify it by calling the widget.
 */
export interface WidgetConfig {
  readonly tenantId: TenantId;
  /**
   * Exact origin strings, compared with `===` against the `Origin` header.
   * No wildcards and no suffix matching: `evil-acme.com` must never satisfy a
   * rule written for `acme.com`, and suffix checks are how that happens.
   */
  readonly origins: readonly string[];
  /** Public Turnstile site key, rendered by the embed. Not the secret. */
  readonly turnstileSiteKey: string;
  readonly scope: WidgetScope;
  /** Absent means the stylesheet's default. The text colour on it is derived at mount. */
  readonly brandColor?: string | undefined;
}

export const widgetConfigSchema = z.object({
  tenantId: tenantIdSchema,
  origins: z.array(z.string().min(1)).max(50),
  turnstileSiteKey: z.string().min(1),
  scope: widgetScopeSchema,
  brandColor: brandColorSchema.optional(),
});

export const widgetConfigKvKey = (siteKey: WidgetSiteKey): string => `widget:${siteKey}`;

/**
 * Whether a request's `Origin` may use this widget.
 *
 * A missing `Origin` is refused rather than waved through. Browsers always send
 * one on cross-origin requests and on WebSocket upgrades, so absence means the
 * caller is not a browser page, which is exactly the case the allowlist exists
 * to exclude.
 */
export function isAllowedOrigin(config: WidgetConfig, origin: string | null): boolean {
  return origin !== null && config.origins.includes(origin);
}

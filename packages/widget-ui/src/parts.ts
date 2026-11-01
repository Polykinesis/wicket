// The subpath, never the barrel: the barrel re-exports `password.ts`, which
// imports `node:crypto` and has no place in a visitor's browser.
import { ESCALATION_RULES } from "@cf-chat/shared/reply";
import { z } from "zod";

/**
 * The data parts the `Conversation` agent writes onto the stream, parsed at the
 * boundary.
 *
 * The socket is a boundary even though our own agent is on the other end: the
 * shapes here have to accept both today's payload and the one ADR-017 proposes,
 * so every ADR-017 field is optional and defaults to "not known" rather than
 * failing the parse. `score` is accepted on the wire today and deliberately
 * dropped here, since nothing in the UI may show it (ADR-017).
 */

export const SOURCES_PART = "data-sources";
export const ESCALATION_PART = "data-escalation";

const EXCERPT_MAX = 600;

const rawCitationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(300),
  url: z.url({ protocol: /^https?$/ }).nullable(),
  // ADR-017. Absent today.
  excerpt: z.string().max(EXCERPT_MAX).nullish(),
  quote: z.string().max(EXCERPT_MAX).nullish(),
  indexedAt: z.iso.datetime({ offset: true }).or(z.iso.date()).nullish(),
  used: z.boolean().nullish(),
});

export interface Citation {
  readonly id: string;
  readonly title: string;
  /** Only http(s). Anything else fails the parse rather than becoming a link. */
  readonly url: string | null;
  readonly excerpt: string | null;
  /**
   * The verified quote, and guaranteed here to be a substring of `excerpt`, so
   * the highlight can never show text that is not in the excerpt. The server
   * verifies against the chunk (ADR-017); this is the second check, against
   * what is actually rendered.
   */
  readonly quote: string | null;
  readonly indexedAt: string | null;
  /** `null` means the server did not say, which is every citation today. */
  readonly used: boolean | null;
}

const citationSchema = rawCitationSchema.transform((raw): Citation => {
  const excerpt = raw.excerpt?.trim() || null;
  const quote = raw.quote?.trim() || null;
  return {
    id: raw.id,
    title: raw.title,
    url: raw.url,
    excerpt,
    quote: excerpt !== null && quote !== null && excerpt.includes(quote) ? quote : null,
    indexedAt: raw.indexedAt ?? null,
    used: raw.used ?? null,
  };
});

/**
 * Items are parsed one at a time and bad ones dropped, so one malformed
 * citation (a `javascript:` URL, an empty title) costs that citation, not every
 * source on the turn.
 */
export const sourcesDataSchema = z.object({
  sources: z
    .array(z.unknown())
    .max(20)
    .transform((items) =>
      items.flatMap((item): Citation[] => {
        const parsed = citationSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
});
export type SourcesData = z.infer<typeof sourcesDataSchema>;

export const COVERAGE = ["full", "partial", "none"] as const;
export type Coverage = (typeof COVERAGE)[number];

export const escalationDataSchema = z.discriminatedUnion("escalated", [
  z.object({
    escalated: z.literal(false),
    // ADR-017: a partial answer is not an escalation, so it rides here.
    coverage: z.enum(COVERAGE).nullish(),
    uncovered: z.string().max(300).nullish(),
  }),
  z.object({
    escalated: z.literal(true),
    signal: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    rule: z.enum(ESCALATION_RULES),
    reason: z.string().max(500),
  }),
]);
export type EscalationData = z.infer<typeof escalationDataSchema>;

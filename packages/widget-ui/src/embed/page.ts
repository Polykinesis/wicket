import { type PageContext, pageContextSchema } from "@cf-chat/shared/widget";

/**
 * What the widget knows about the page it sits on. Sent with each question as
 * message metadata so the agent can lean on "the visitor is looking at the
 * pricing page" without being told so. Query and fragment are dropped here,
 * before the value leaves the browser, so a session id or a search term in
 * the URL never reaches the server.
 */

const TITLE_MAX = 200;
const LABEL_MAX = 60;

export function currentPage(
  doc: Pick<Document, "title"> = document,
  loc: Pick<Location, "origin" | "pathname"> = location,
): PageContext | null {
  const candidate = {
    url: `${loc.origin}${loc.pathname}`,
    title: doc.title.trim().slice(0, TITLE_MAX),
  };
  const parsed = pageContextSchema.safeParse(candidate);
  // A `file:` page or an `about:blank` host has no URL worth sending.
  return parsed.success ? parsed.data : null;
}

/**
 * The page title as a chip: the site name that most titles carry after a
 * separator is dropped when there is something before it, then the rest is
 * cut to fit. "Pricing | Northwind Rota" becomes "Pricing"; a title with no
 * separator is kept whole.
 */
export function pageLabel(title: string): string {
  const trimmed = title.trim();
  const parts = trimmed.split(/\s+[|–—-]\s+/);
  const head = parts.length > 1 ? parts.slice(0, -1).join(" - ").trim() : trimmed;
  const label = head.length > 0 ? head : trimmed;
  return label.length > LABEL_MAX ? `${label.slice(0, LABEL_MAX - 1).trimEnd()}…` : label;
}

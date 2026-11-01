import type { ReactElement } from "react";
import { ArrowIcon, DocIcon } from "../icons.tsx";
import type { Citation } from "../parts.ts";
import { shortDate } from "../scope.ts";

/**
 * One source, quoted. The excerpt is retrieved content, so it is rendered as
 * text nodes only: the highlight is a split on a string the parser already
 * proved is a substring of the excerpt, never markup from the server.
 */
export function SourceExcerpt({
  citation,
  now,
}: {
  readonly citation: Citation;
  readonly now: Date;
}): ReactElement {
  const asOf = citation.indexedAt ? shortDate(citation.indexedAt, now) : null;

  return (
    <div className="border-b border-line bg-surface-2 px-3.5 py-3">
      <div className="mb-2 flex items-center gap-2 text-[13px] text-ink-2">
        <DocIcon className="shrink-0" />
        <span className="min-w-0 truncate font-semibold text-ink">{citation.title}</span>
        {asOf ? <span className="ml-auto shrink-0 text-xs text-ink-3">as of {asOf}</span> : null}
      </div>
      {citation.excerpt ? (
        <blockquote className="border-l-[3px] border-brand pl-3 text-sm leading-relaxed text-ink-2">
          <Highlighted text={citation.excerpt} quote={citation.quote} />
        </blockquote>
      ) : null}
      {citation.url ? (
        <a
          className="mt-2.5 inline-flex min-h-8 items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline"
          href={fragmentLink(citation.url, citation.quote)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {citation.quote ? "Open the page at this passage" : "Open the page"}
          <ArrowIcon />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : null}
    </div>
  );
}

function Highlighted({
  text,
  quote,
}: {
  readonly text: string;
  readonly quote: string | null;
}): ReactElement {
  const at = quote ? text.indexOf(quote) : -1;
  if (!quote || at === -1) {
    return <>{text}</>;
  }
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[3px] bg-mark px-0.5 text-ink">{quote}</mark>
      {text.slice(at + quote.length)}
    </>
  );
}

/** Words at each end of a long quote, for `textStart,textEnd`. */
const FRAGMENT_EDGE_WORDS = 5;

/**
 * A text-fragment link (`#:~:text=`) so the page opens scrolled to the quote.
 * Browsers without support open the page normally, which is the fallback.
 *
 * Long quotes use `start,end` rather than the whole sentence: shorter URLs,
 * and a match survives small differences in the middle (whitespace, a soft
 * hyphen) between indexed text and the live page. `-`, `,` and `&` are syntax
 * in a fragment directive and must be percent-encoded, and
 * `encodeURIComponent` leaves `-` alone, hence the extra replace.
 */
export function fragmentLink(url: string, quote: string | null): string {
  const base = url.split("#")[0] ?? url;
  if (!quote) {
    return base;
  }
  const words = quote.split(/\s+/).filter(Boolean);
  const encode = (value: string): string => encodeURIComponent(value).replaceAll("-", "%2D");
  const directive =
    words.length > FRAGMENT_EDGE_WORDS * 2
      ? `${encode(words.slice(0, FRAGMENT_EDGE_WORDS).join(" "))},${encode(words.slice(-FRAGMENT_EDGE_WORDS).join(" "))}`
      : encode(words.join(" "));
  return `${base}#:~:text=${directive}`;
}

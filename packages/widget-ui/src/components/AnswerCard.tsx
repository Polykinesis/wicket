import { type ReactElement, useState } from "react";
import { DocIcon } from "../icons.tsx";
import type { Citation } from "../parts.ts";
import { SourceExcerpt } from "./SourceExcerpt.tsx";

/**
 * Source first, then the answer. The answer is model output and rendered as
 * plain text split into paragraphs: no markdown, no HTML, so nothing a poisoned
 * chunk persuades the model to print can become markup.
 */
export function AnswerCard({
  text,
  cited,
  searched,
  streaming,
  now,
}: {
  readonly text: string;
  readonly cited: readonly Citation[];
  readonly searched: readonly Citation[];
  readonly streaming: boolean;
  readonly now: Date;
}): ReactElement {
  const [showAll, setShowAll] = useState(false);
  const [primary, ...otherCited] = cited;
  const more = [...otherCited, ...searched];

  return (
    <article className="overflow-hidden rounded-xl border border-line" aria-busy={streaming}>
      {primary ? <SourceExcerpt citation={primary} now={now} /> : null}
      <div className="space-y-3 px-3.5 pt-3 pb-3.5 text-[15px] leading-relaxed">
        {paragraphs(text).map((paragraph, index) => (
          // Paragraphs have no identity beyond position, and the list only
          // ever grows at the end while streaming, so the index is stable.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      {more.length > 0 && !showAll ? (
        <button
          type="button"
          className="flex min-h-11 w-full items-center gap-2 border-t border-line px-3.5 py-2.5 text-left text-[13px] text-ink-2 hover:bg-surface-2"
          onClick={() => setShowAll(true)}
        >
          <DocIcon />
          {more.length === 1 ? `1 more source: ${more[0]?.title}` : `${more.length} more sources`}
        </button>
      ) : null}
      {showAll
        ? more.map((citation) => <SourceExcerpt key={citation.id} citation={citation} now={now} />)
        : null}
    </article>
  );
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

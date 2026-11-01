import type { ReactElement } from "react";
import { pageLabel } from "../embed/page.ts";
import type { WidgetScope } from "../scope.ts";
import { SuggestionButton } from "./states.tsx";

/**
 * No greeting and no persona. What it knows about, then what people actually
 * ask. Either list is omitted when the config does not carry it, and if both
 * are missing the panel opens straight onto the composer.
 */
export function EmptyState({
  scope,
  page,
  onAsk,
}: {
  readonly scope: WidgetScope;
  /** The host page, when the embed knows it. */
  readonly page: { readonly title: string } | null;
  readonly onAsk: (question: string) => void;
}): ReactElement | null {
  const topics = scope.topics ?? [];
  const suggestions = scope.suggestedQuestions ?? [];
  const label = page ? pageLabel(page.title) : "";
  if (topics.length === 0 && suggestions.length === 0 && label.length === 0) {
    return null;
  }

  return (
    <>
      {label.length > 0 ? (
        <p className="text-[13px] text-ink-3">
          On this page: <span className="font-medium text-ink-2">{label}</span>
        </p>
      ) : null}
      {topics.length > 0 ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">
            What it knows about
          </h3>
          {/*
            A plain list, not pills: a bordered pill reads as a button, and
            these are a statement of coverage, not a filter. The separator is
            generated content on the preceding item, so a wrapped line ends
            with it rather than starting with one, and assistive tech, which
            already announces list items one by one, never hears it.
          */}
          <ul className="flex flex-wrap gap-1 text-[15px] text-ink-2">
            {topics.map((topic) => (
              <li
                key={topic}
                className="after:ml-1 after:text-ink-3 after:content-['·'] last:after:content-none"
              >
                {topic}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {suggestions.length > 0 ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">
            Asked most often
          </h3>
          <div className="flex flex-col gap-1.5">
            {suggestions.map((question) => (
              <SuggestionButton key={question} text={question} onAsk={onAsk} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

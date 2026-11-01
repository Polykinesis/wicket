import type { ReactElement } from "react";
import type { ScopeView } from "../scope.ts";
import { SuggestionButton } from "./states.tsx";

/**
 * No greeting and no persona. What it knows about, then what people actually
 * ask. Either list is omitted when the config does not carry it, and if both
 * are missing the panel opens straight onto the composer.
 */
export function EmptyState({
  scope,
  onAsk,
}: {
  readonly scope: ScopeView;
  readonly onAsk: (question: string) => void;
}): ReactElement | null {
  const topics = scope.topics ?? [];
  const suggestions = scope.suggestedQuestions ?? [];
  if (topics.length === 0 && suggestions.length === 0) {
    return null;
  }

  return (
    <>
      {topics.length > 0 ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">
            What it knows about
          </h3>
          {/*
            A plain list, not pills: a bordered pill reads as a button, and
            these are a statement of coverage, not a filter. The separator is
            decorative, so it is hidden from assistive tech, which already
            announces the list items one by one.
          */}
          <ul className="flex flex-wrap gap-x-1 gap-y-1 text-[15px] text-ink-2">
            {topics.map((topic, index) => (
              <li key={topic} className="flex items-center gap-1">
                {index > 0 ? (
                  <span aria-hidden="true" className="text-ink-3">
                    &middot;
                  </span>
                ) : null}
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

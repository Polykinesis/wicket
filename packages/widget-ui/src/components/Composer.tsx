import { type FormEvent, type KeyboardEvent, type ReactElement, useId, useState } from "react";
import { SendIcon } from "../icons.tsx";

const QUESTION_MAX = 2000;

/**
 * Question input plus the always-visible way out to a person. Enter sends,
 * Shift+Enter adds a line. Sending is blocked while a turn is in flight, typing
 * is not, so a visitor can draft the follow-up while the answer streams.
 */
export function Composer({
  tenantName,
  busy,
  onAsk,
  onTalkToPerson,
}: {
  readonly tenantName: string;
  readonly busy: boolean;
  readonly onAsk: (question: string) => void;
  readonly onTalkToPerson: () => void;
}): ReactElement {
  const id = useId();
  const [value, setValue] = useState("");
  const question = value.trim();
  const canSend = !busy && question.length > 0;

  function send(event?: FormEvent): void {
    event?.preventDefault();
    if (!canSend) {
      return;
    }
    onAsk(question);
    setValue("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      send(event);
    }
  }

  return (
    <div className="border-t border-line px-3 pt-2.5 pb-3">
      <form className="flex items-end gap-2" onSubmit={send}>
        <label htmlFor={id} className="sr-only">
          Ask a question
        </label>
        <textarea
          id={id}
          rows={1}
          value={value}
          maxLength={QUESTION_MAX}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask a question"
          className="max-h-30 min-h-11 flex-1 resize-none rounded-[10px] border border-field px-3 py-2.5 text-base leading-snug"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send question"
          className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-brand text-brand-ink disabled:opacity-50"
        >
          <SendIcon />
        </button>
      </form>
      <div className="mt-2 flex justify-between gap-2 text-xs text-ink-3">
        <span>Only uses what {tenantName} has published</span>
        <button
          type="button"
          onClick={onTalkToPerson}
          className="shrink-0 py-1 font-semibold text-brand underline underline-offset-2"
        >
          Talk to a person
        </button>
      </div>
    </div>
  );
}

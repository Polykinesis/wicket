import { type FormEvent, type KeyboardEvent, type ReactElement, useId, useState } from "react";
import type { ConnectionView } from "../embed/connection.ts";
import { SendIcon } from "../icons.tsx";

const QUESTION_MAX = 2000;

const CONNECTION_NOTE: Readonly<Record<Exclude<ConnectionView, "ready">, string>> = {
  connecting: "Connecting",
  offline: "Connection lost, trying again",
  refused: "Chat is not available on this page",
};

/**
 * Question input plus the always-visible way out to a person. Enter sends,
 * Shift+Enter adds a line. Sending is blocked while a turn is in flight, typing
 * is not, so a visitor can draft the follow-up while the answer streams.
 */
export function Composer({
  tenantName,
  busy,
  connection,
  onAsk,
  onTalkToPerson,
}: {
  readonly tenantName: string;
  readonly busy: boolean;
  readonly connection: ConnectionView;
  readonly onAsk: (question: string) => void;
  readonly onTalkToPerson: () => void;
}): ReactElement {
  const id = useId();
  const [value, setValue] = useState("");
  const question = value.trim();
  // Typing is allowed while connecting so the question is ready when the
  // socket is; only sending waits. Refused disables the input outright.
  const canSend = !busy && connection === "ready" && question.length > 0;

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
    <div className="border-t border-line px-3 pt-2.5 pb-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
          disabled={connection === "refused"}
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
      {/* Side by side when it fits; at phone width the line stacks rather than wrapping mid-sentence beside the button. */}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-ink-3 max-sm:flex-col max-sm:items-start max-sm:gap-0.5">
        {/* The footnote slot doubles as the connection status, so nothing new appears or shifts. */}
        <span role="status">
          {connection === "ready"
            ? `Only uses what ${tenantName} has published`
            : CONNECTION_NOTE[connection]}
        </span>
        <button
          type="button"
          onClick={onTalkToPerson}
          className="shrink-0 py-1 font-semibold text-brand underline underline-offset-2 max-sm:min-h-11"
        >
          Talk to a person
        </button>
      </div>
    </div>
  );
}

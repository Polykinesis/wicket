import { type ReactElement, type ReactNode, useId } from "react";
import type { HandoffReceipt } from "../handoff.ts";
import { ArrowIcon, CheckIcon, GrowIcon } from "../icons.tsx";
import type { Citation } from "../parts.ts";

/**
 * The small, single-purpose pieces each turn state is built from. Grouped in one
 * file because none of them is used outside `TurnBlock` and each is a few lines.
 */

export function Question({ text }: { readonly text: string }): ReactElement {
  return (
    <div>
      <p className="mb-0.5 text-xs text-ink-3">You asked</p>
      <p className="text-[15px] leading-snug font-semibold">{text}</p>
    </div>
  );
}

/**
 * Shows which documents it is reading while the answer is generated, instead
 * of typing dots. Retrieval finishes before generation starts, so the titles
 * arrive in one batch rather than ticking in.
 */
export function Searching({
  tenantName,
  searched,
}: {
  readonly tenantName: string;
  readonly searched: readonly Citation[];
}): ReactElement {
  return (
    <div className="flex flex-col gap-2" role="status">
      <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">
        Searching {tenantName}&apos;s content
      </p>
      {searched.map((citation) => (
        <div key={citation.id} className="flex items-center gap-2.5 text-sm text-ink-2">
          <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
            <CheckIcon />
          </span>
          <span className="truncate">{citation.title}</span>
        </div>
      ))}
      <div className="flex items-center gap-2.5 text-sm text-ink-2">
        <span className="size-[18px] shrink-0 rounded-full border-2 border-brand border-t-transparent motion-safe:animate-spin" />
        {searched.length > 0 ? "Writing the answer" : "Looking for an answer"}
      </div>
      <div className="mt-1.5 h-3 w-11/12 rounded-md bg-linear-to-r from-surface-2 via-line to-surface-2 bg-size-[200%_100%] motion-safe:animate-shimmer" />
      <div className="h-3 w-3/4 rounded-md bg-linear-to-r from-surface-2 via-line to-surface-2 bg-size-[200%_100%] motion-safe:animate-shimmer" />
    </div>
  );
}

/**
 * The site key or the page's origin was refused. Nothing the visitor can do
 * about it, so no retry and no form: the owner has to fix the allowlist. The
 * copy blames the setup, not the visitor.
 */
export function ConnectionRefused(): ReactElement {
  return (
    <GapNotice heading="Chat is not available on this page">
      <p>The site owner has not enabled it for this address.</p>
    </GapNotice>
  );
}

/**
 * The "not covered" panel. Dashed and amber rather than red: nothing went
 * wrong, the content just does not say, and the visitor should read it as an
 * honest answer rather than an error.
 */
export function GapNotice({
  heading,
  children,
}: {
  readonly heading: string;
  readonly children: ReactNode;
}): ReactElement {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="rounded-xl border border-dashed border-gap-line bg-gap p-3.5 text-sm leading-normal text-ink-2"
    >
      <h3 id={id} className="mb-1 text-[15px] font-semibold text-ink">
        {heading}
      </h3>
      {children}
    </section>
  );
}

/** Tells the visitor their question also helps fill the gap: the loop, visible. */
export function LoopLine({ tenantName }: { readonly tenantName: string }): ReactElement {
  return (
    <p className="mt-3 flex gap-2 border-t border-line pt-2.5 text-[13px] leading-snug text-ink-3">
      <GrowIcon className="mt-px shrink-0" />
      <span>Questions like this help {tenantName} add the answer to their help content.</span>
    </p>
  );
}

export function HandoffSent({
  receipt,
  recipient,
  replyTime,
}: {
  readonly receipt: HandoffReceipt;
  readonly recipient: string;
  readonly replyTime: string | undefined;
}): ReactElement {
  return (
    <section role="status" className="rounded-xl border border-line p-4">
      <h3 className="mb-1.5 flex items-center gap-2 text-base font-semibold">
        <span className="text-ok">
          <CheckIcon />
        </span>
        Sent to {recipient}
      </h3>
      <p className="text-sm text-ink-2">You don&apos;t need to keep this window open.</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 text-sm">
        <dt className="text-ink-3">Reply to</dt>
        <dd className="break-all">{receipt.email}</dd>
        {replyTime ? (
          <>
            <dt className="text-ink-3">Expect it</dt>
            <dd>{replyTime}</dd>
          </>
        ) : null}
        <dt className="text-ink-3">Reference</dt>
        <dd className="font-mono">{receipt.reference}</dd>
      </dl>
    </section>
  );
}

export function SuggestionButton({
  text,
  onAsk,
}: {
  readonly text: string;
  readonly onAsk: (question: string) => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={() => onAsk(text)}
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[10px] border border-line bg-surface px-3.5 py-3 text-left text-sm hover:border-brand hover:bg-brand-soft"
    >
      {text}
      <ArrowIcon className="shrink-0" />
    </button>
  );
}

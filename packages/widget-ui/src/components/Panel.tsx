import { type ReactElement, type ReactNode, useEffect, useId, useRef } from "react";
import { AskIcon, CloseIcon } from "../icons.tsx";

/**
 * The launcher. A labelled pill rather than an icon bubble, so the button says
 * what it knows about before anyone opens it.
 */
export function Launcher({
  label,
  onOpen,
}: {
  readonly label: string;
  readonly onOpen: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className="fixed right-6 bottom-6 inline-flex min-h-12 max-w-[calc(100vw-28px)] items-center gap-2.5 rounded-full bg-brand py-0 pr-5 pl-4 text-[15px] font-semibold text-brand-ink shadow-panel max-sm:right-3.5 max-sm:bottom-3.5 max-sm:text-sm"
    >
      <AskIcon className="shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * The open panel. A non-modal dialog: the host page stays usable behind it on
 * desktop, so focus is moved in on open and Escape closes, but focus is not
 * trapped. Full screen below the `sm` breakpoint.
 */
export function Panel({
  title,
  scopeLine,
  onClose,
  footer,
  children,
}: {
  readonly title: string;
  readonly scopeLine: string | null;
  readonly onClose: () => void;
  readonly footer: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  const titleId = useId();
  const scopeId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={scopeLine ? scopeId : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      className="fixed right-6 bottom-6 flex h-[min(660px,calc(100dvh-48px))] w-[400px] flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-panel max-sm:inset-0 max-sm:h-dvh max-sm:w-auto max-sm:rounded-none max-sm:border-0"
    >
      <header className="flex items-start gap-3 border-b border-line px-4.5 pt-4 pb-3.5">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-base font-semibold tracking-tight">
            {title}
          </h2>
          {scopeLine ? (
            <p id={scopeId} className="mt-1 text-[13px] leading-snug text-ink-2">
              {scopeLine}
            </p>
          ) : null}
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mt-2.5 -mr-2.5 grid size-11 place-items-center rounded-[10px] text-ink-2 hover:bg-surface-2"
        >
          <CloseIcon />
        </button>
      </header>
      <div className="flex flex-1 flex-col gap-4.5 overflow-y-auto px-4.5 pt-4 pb-2 *:shrink-0">
        {children}
      </div>
      {footer}
    </div>
  );
}

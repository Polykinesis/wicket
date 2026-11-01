import { type ReactElement, type ReactNode, type Ref, useEffect, useId, useRef } from "react";
import { AskIcon, CloseIcon } from "../icons.tsx";

/**
 * How the launcher presents before the panel opens. `labelled` is the default:
 * a pill that says what it knows about. `icon` is for hosts whose corner is
 * already crowded; the label becomes the accessible name, so nothing is lost
 * to assistive tech.
 */
export type LauncherVariant = "labelled" | "icon";

/**
 * The launcher. A labelled pill rather than an icon bubble, so the button says
 * what it knows about before anyone opens it.
 *
 * Neither this nor `Panel` positions itself. Where the widget sits on the page
 * (floating in a corner, full screen on a phone, or inline in a docs page) is
 * the embed shell's decision, so both render as fills of whatever box they are
 * given.
 */
export function Launcher({
  label,
  variant,
  focusOnMount,
  onOpen,
}: {
  readonly label: string;
  readonly variant: LauncherVariant;
  /**
   * True when the panel was just closed, so keyboard focus comes back here
   * instead of falling to the host page's body. Never on first mount: a widget
   * must not steal focus from the page it was embedded in.
   */
  readonly focusOnMount: boolean;
  readonly onOpen: () => void;
}): ReactElement {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusOnMount) {
      ref.current?.focus();
    }
  }, [focusOnMount]);

  switch (variant) {
    case "labelled":
      return (
        <button
          ref={ref}
          type="button"
          onClick={onOpen}
          aria-haspopup="dialog"
          className="inline-flex max-w-full min-h-12 items-center gap-2.5 rounded-full bg-brand py-0 pr-5 pl-4 text-[15px] font-semibold text-brand-ink shadow-panel max-sm:text-sm"
        >
          <AskIcon className="shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      );
    case "icon":
      return (
        <button
          ref={ref}
          type="button"
          onClick={onOpen}
          aria-haspopup="dialog"
          aria-label={label}
          className="grid size-14 place-items-center rounded-full bg-brand text-brand-ink shadow-panel"
        >
          <AskIcon className="size-6" />
        </button>
      );
    default:
      return assertNever(variant);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled launcher variant: ${String(value)}`);
}

/**
 * The open panel. A non-modal dialog: the host page stays usable behind it on
 * desktop, so focus is moved in on open and Escape closes, but focus is not
 * trapped. Fills its container; the shell decides the container's size, and
 * strips the radius and border when it goes full screen.
 */
export function Panel({
  title,
  scopeLine,
  onClose,
  footer,
  bodyRef,
  children,
}: {
  readonly title: string;
  readonly scopeLine: string | null;
  readonly onClose: () => void;
  readonly footer: ReactNode;
  /** The scrolling body, for whoever owns the content to scroll it. */
  readonly bodyRef?: Ref<HTMLDivElement>;
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
      className="flex size-full flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-panel max-sm:rounded-none max-sm:border-0"
    >
      <header className="flex items-start gap-3 border-b border-line px-4.5 pt-4 pb-3.5 max-sm:pt-[max(1rem,env(safe-area-inset-top))]">
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
      <div
        ref={bodyRef}
        className="flex flex-1 flex-col gap-4.5 overflow-y-auto px-4.5 pt-4 pb-2 *:shrink-0"
      >
        {children}
      </div>
      {footer}
    </div>
  );
}

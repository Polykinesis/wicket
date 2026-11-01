import { type ReactElement, useEffect, useRef, useState } from "react";
import { Composer } from "./components/Composer.tsx";
import { EmptyState } from "./components/EmptyState.tsx";
import { HandoffForm } from "./components/HandoffForm.tsx";
import { Launcher, type LauncherVariant, Panel } from "./components/Panel.tsx";
import { GapNotice, HandoffSent } from "./components/states.tsx";
import { TurnBlock } from "./components/TurnBlock.tsx";
import type { HandoffReceipt, SubmitHandoff } from "./handoff.ts";
import { handoffRecipient, launcherLabel, type ScopeView, scopeLine } from "./scope.ts";
import type { TurnKind, TurnView } from "./turn.ts";

export interface WidgetProps {
  readonly scope: ScopeView;
  /** From `buildTurns(messages, status)`. */
  readonly turns: readonly TurnView[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAsk: (question: string) => void;
  readonly onSubmitHandoff: SubmitHandoff;
  /** Icon-only launcher for crowded host corners. Labelled by default. */
  readonly launcher?: LauncherVariant;
  /** Injected for tests and so relative dates agree with the server's clock. */
  readonly now?: Date;
}

/** The footer's "Talk to a person", independent of any turn. */
type Direct =
  | { readonly phase: "closed" }
  | { readonly phase: "open" }
  | { readonly phase: "sent"; readonly receipt: HandoffReceipt };

/**
 * The whole widget, controlled. It owns no transport and no conversation
 * state: the embed holds the chat hook, derives `turns`, and passes callbacks.
 * That keeps every state renderable from fixtures, which is how the tests and
 * any preview page drive it.
 */
export function Widget({
  scope,
  turns,
  open,
  onOpenChange,
  onAsk,
  onSubmitHandoff,
  launcher = "labelled",
  now = new Date(),
}: WidgetProps): ReactElement {
  const [direct, setDirect] = useState<Direct>({ phase: "closed" });

  // Focus moves between launcher and panel only on a change the visitor made.
  // Neither takes focus on the widget's first render, whichever way it mounts:
  // a widget must not steal focus from the page it was embedded in.
  const mounted = useRef(false);
  const everOpened = useRef(open);
  useEffect(() => {
    mounted.current = true;
    if (open) {
      everOpened.current = true;
    }
  }, [open]);

  const bodyRef = useRef<HTMLDivElement>(null);
  const latestRef = useRef<HTMLDivElement>(null);
  const turnCount = turns.length;
  // On a new turn and on reopen: the body unmounts with the panel, so a
  // conversation resumed later would otherwise show its first turn.
  useEffect(() => {
    if (!open || turnCount === 0) {
      return;
    }
    scrollToLatest(bodyRef.current, latestRef.current);
  }, [open, turnCount]);

  if (!open) {
    return (
      <Launcher
        label={launcherLabel(scope)}
        variant={launcher}
        focusOnMount={everOpened.current}
        onOpen={() => onOpenChange(true)}
      />
    );
  }

  const last = turns.at(-1);
  const busy = last?.kind === "searching" || (last?.kind === "answered" && last.streaming);
  const recipient = handoffRecipient(scope);

  return (
    <Panel
      title={`Ask ${scope.tenantName}`}
      scopeLine={scopeLine(scope, now)}
      onClose={() => onOpenChange(false)}
      focusOnMount={mounted.current}
      bodyRef={bodyRef}
      footer={
        <Composer
          tenantName={scope.tenantName}
          busy={busy}
          onAsk={onAsk}
          onTalkToPerson={() =>
            setDirect((current) => (current.phase === "sent" ? current : { phase: "open" }))
          }
        />
      }
    >
      {turns.length === 0 ? <EmptyState scope={scope} onAsk={onAsk} /> : null}
      {turns.map((turn, index) => (
        <TurnBlock
          // Turns are append-only and never reorder, so position is identity.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          key={index}
          ref={index === turns.length - 1 ? latestRef : undefined}
          turn={turn}
          scope={scope}
          now={now}
          onSubmitHandoff={onSubmitHandoff}
        />
      ))}
      {direct.phase === "open" ? (
        <GapNotice heading={`Message ${recipient}`}>
          <HandoffForm
            defaultQuestion=""
            recipient={recipient}
            replyTime={scope.replyTime}
            cta={`Send to ${recipient}`}
            onSubmit={onSubmitHandoff}
            onSent={(receipt) => setDirect({ phase: "sent", receipt })}
          />
        </GapNotice>
      ) : null}
      {direct.phase === "sent" ? (
        <HandoffSent receipt={direct.receipt} recipient={recipient} replyTime={scope.replyTime} />
      ) : null}
      <p className="sr-only" role="status">
        {last && !busy ? ANNOUNCE[last.kind] : ""}
      </p>
    </Panel>
  );
}

/**
 * Bring the newest turn to the top of the panel body, so the visitor sees
 * their question and the answer fills in below it. Done on the scroller
 * directly rather than with `scrollIntoView`, which also aligns every
 * scrolling ancestor including the window and jumps the host page under a
 * fixed panel.
 */
function scrollToLatest(scroller: HTMLDivElement | null, latest: HTMLDivElement | null): void {
  if (!scroller || !latest) {
    return;
  }
  // Align the turn with the top of the content area, under the body's own
  // padding, not with the border where the header divider sits.
  const padding = Number.parseFloat(getComputedStyle(scroller).paddingTop) || 0;
  const top =
    latest.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top +
    scroller.scrollTop -
    padding;
  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (typeof scroller.scrollTo === "function") {
    scroller.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
  } else {
    scroller.scrollTop = top;
  }
}

/**
 * What a screen reader hears when a turn settles. Streaming text is not put in
 * a live region, since reading every delta aloud is unusable; this one line
 * says the turn is done and what kind of outcome to look for.
 */
const ANNOUNCE: Readonly<Record<TurnKind, string>> = {
  searching: "",
  answered: "Answer ready, with its source.",
  partial: "Partly answered. The rest can go to a person.",
  not_found: "Not covered in the published content. You can send the question to a person.",
  person_requested: "You can send this to a person.",
  unavailable: "Search is unavailable. You can send the question to a person.",
  failed: "The answer did not arrive.",
};

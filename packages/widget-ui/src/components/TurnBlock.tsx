import { type ReactElement, useState } from "react";
import type { HandoffReceipt, SubmitHandoff } from "../handoff.ts";
import { handoffRecipient, type ScopeView } from "../scope.ts";
import type { TurnView } from "../turn.ts";
import { AnswerCard } from "./AnswerCard.tsx";
import { HandoffForm } from "./HandoffForm.tsx";
import { GapNotice, HandoffSent, LoopLine, Question, Searching } from "./states.tsx";

/**
 * What the visitor has done with this turn's handoff. Local to the turn because
 * it is UI state about this question's form, not conversation state: the agent
 * learns about a handoff from the submit call, not from this.
 *
 * Only actions are stored, never a default derived from `turn.kind`: a turn
 * mounts as `searching` and changes kind as the stream arrives, so a default
 * captured at mount would be the wrong one by the time it matters.
 */
type Handoff =
  | { readonly phase: "untouched" }
  | { readonly phase: "opened" }
  | { readonly phase: "sent"; readonly receipt: HandoffReceipt };

export function TurnBlock({
  turn,
  scope,
  now,
  onSubmitHandoff,
}: {
  readonly turn: TurnView;
  readonly scope: ScopeView;
  readonly now: Date;
  readonly onSubmitHandoff: SubmitHandoff;
}): ReactElement {
  const [handoff, setHandoff] = useState<Handoff>({ phase: "untouched" });
  // Partial answers only offer the form; the visitor already has most of what
  // they asked for. Every other gap state opens it straight away.
  const offerOnly = turn.kind === "partial" && handoff.phase === "untouched";
  const recipient = handoffRecipient(scope);

  const form = (defaultQuestion: string, cta: string): ReactElement =>
    handoff.phase === "sent" ? (
      <div className="mt-3">
        <HandoffSent receipt={handoff.receipt} recipient={recipient} replyTime={scope.replyTime} />
      </div>
    ) : (
      <HandoffForm
        defaultQuestion={defaultQuestion}
        recipient={recipient}
        replyTime={scope.replyTime}
        cta={cta}
        onSubmit={onSubmitHandoff}
        onSent={(receipt) => setHandoff({ phase: "sent", receipt })}
      />
    );

  return (
    <div className="flex flex-col gap-4">
      <Question text={turn.question} />
      {body()}
    </div>
  );

  function body(): ReactElement {
    switch (turn.kind) {
      case "searching":
        return <Searching tenantName={scope.tenantName} searched={turn.searched} />;

      case "answered":
        return (
          <AnswerCard
            text={turn.text}
            cited={turn.cited}
            searched={turn.searched}
            streaming={turn.streaming}
            now={now}
          />
        );

      case "partial":
        return (
          <>
            <AnswerCard
              text={turn.text}
              cited={turn.cited}
              searched={turn.searched}
              streaming={false}
              now={now}
            />
            <GapNotice
              heading={
                turn.uncovered
                  ? "Not covered in what was published"
                  : "This may not be the full answer"
              }
            >
              <p>
                {turn.uncovered ??
                  `The published content only partly covers this. ${recipient} can confirm the rest.`}
              </p>
              {offerOnly ? (
                <button
                  type="button"
                  onClick={() => setHandoff({ phase: "opened" })}
                  className="mt-3 min-h-11 w-full rounded-[10px] border border-line bg-surface px-4 text-[15px] font-semibold text-brand"
                >
                  {turn.uncovered ? `Send this part to ${recipient}` : `Check with ${recipient}`}
                </button>
              ) : (
                form(turn.uncovered ?? turn.question, `Send to ${recipient}`)
              )}
            </GapNotice>
          </>
        );

      case "not_found":
        return (
          <GapNotice heading={`Nothing ${scope.tenantName} has published covers this`}>
            <p>Rather than guess, this can go to {recipient}.</p>
            {turn.searched.length > 0 ? (
              <p className="mt-2 text-[13px] text-ink-3">
                Looked in: {turn.searched.map((citation) => citation.title).join(", ")}
              </p>
            ) : null}
            {form(turn.question, `Send to ${recipient}`)}
            <LoopLine tenantName={scope.tenantName} />
          </GapNotice>
        );

      case "person_requested":
        return (
          <GapNotice
            heading={
              turn.why === "asked"
                ? `Passing you to ${recipient}`
                : `${recipient} handles this directly`
            }
          >
            <p>
              {turn.why === "asked"
                ? "Leave your email and the question, and a person will reply."
                : "Questions about refunds, cancellations or legal matters go to a person rather than being answered automatically."}
            </p>
            {form(turn.question, `Send to ${recipient}`)}
          </GapNotice>
        );

      case "unavailable":
        return (
          <GapNotice heading="Can't search right now">
            <p>Something on our side is not working. Your question can still go to {recipient}.</p>
            {form(turn.question, `Send to ${recipient}`)}
          </GapNotice>
        );

      case "failed":
        return (
          <GapNotice heading="That didn't come through">
            <p>
              The connection dropped before an answer arrived. Ask again, or send it to {recipient}.
            </p>
            {form(turn.question, `Send to ${recipient}`)}
          </GapNotice>
        );

      default: {
        const exhaustive: never = turn;
        throw new Error(`Unhandled turn ${JSON.stringify(exhaustive)}`);
      }
    }
  }
}

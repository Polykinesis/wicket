import { type FormEvent, type ReactElement, useId, useState } from "react";
import {
  type HandoffField,
  type HandoffReceipt,
  handoffErrorMessage,
  handoffInputSchema,
  type SubmitHandoff,
} from "../handoff.ts";
import { PersonIcon } from "../icons.tsx";

type FormState =
  | { readonly phase: "editing"; readonly errors: Partial<Record<HandoffField, string>> }
  | { readonly phase: "sending" }
  | { readonly phase: "failed"; readonly message: string };

/**
 * Inline handoff. Validates on submit, shows each error next to its field, and
 * keeps everything typed when sending fails: losing a visitor's message on a
 * network blip is the one thing this form must never do.
 */
export function HandoffForm({
  defaultQuestion,
  recipient,
  replyTime,
  cta,
  onSubmit,
  onSent,
}: {
  readonly defaultQuestion: string;
  readonly recipient: string;
  readonly replyTime: string | undefined;
  readonly cta: string;
  readonly onSubmit: SubmitHandoff;
  readonly onSent: (receipt: HandoffReceipt) => void;
}): ReactElement {
  const id = useId();
  const [state, setState] = useState<FormState>({ phase: "editing", errors: {} });
  const errors = state.phase === "editing" ? state.errors : {};

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = handoffInputSchema.safeParse({
      email: String(form.get("email") ?? ""),
      name: String(form.get("name") ?? ""),
      question: String(form.get("question") ?? ""),
    });
    if (!parsed.success) {
      const next: Partial<Record<HandoffField, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === "email" || field === "name" || field === "question") && !next[field]) {
          next[field] = issue.message;
        }
      }
      setState({ phase: "editing", errors: next });
      return;
    }

    setState({ phase: "sending" });
    const result = await onSubmit(parsed.data);
    if (result.ok) {
      onSent(result.value);
      return;
    }
    if (result.error.kind === "invalid") {
      setState({ phase: "editing", errors: { [result.error.field]: result.error.message } });
      return;
    }
    setState({ phase: "failed", message: handoffErrorMessage(result.error) });
  }

  return (
    <form
      className="mt-3 flex flex-col gap-2.5"
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      <Field id={`${id}-email`} label="Your email" error={errors.email}>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="you@company.com"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? `${id}-email-error` : undefined}
          className={inputClass}
        />
      </Field>
      <Field id={`${id}-name`} label="Name" optional error={errors.name}>
        <input
          id={`${id}-name`}
          name="name"
          autoComplete="name"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${id}-name-error` : undefined}
          className={inputClass}
        />
      </Field>
      <Field id={`${id}-question`} label="Your question" error={errors.question}>
        <textarea
          id={`${id}-question`}
          name="question"
          defaultValue={defaultQuestion}
          required
          rows={3}
          aria-invalid={errors.question ? true : undefined}
          aria-describedby={errors.question ? `${id}-question-error` : undefined}
          className={`${inputClass} min-h-16 resize-y leading-snug`}
        />
      </Field>
      <p className="flex items-center gap-2 text-[13px] text-ink-2">
        <PersonIcon className="shrink-0" />
        <span>
          Goes to {recipient}
          {replyTime ? `, who usually replies ${replyTime}` : ""}.
        </span>
      </p>
      <button
        type="submit"
        disabled={state.phase === "sending"}
        className="min-h-11 rounded-[10px] bg-brand px-4 text-[15px] font-semibold text-brand-ink disabled:opacity-60"
      >
        {state.phase === "sending" ? "Sending" : cta}
      </button>
      {state.phase === "failed" ? (
        <p role="alert" className="text-[13px] text-danger">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

const inputClass =
  "min-h-11 w-full rounded-lg border border-field bg-surface px-3 py-2.5 text-base aria-invalid:border-danger";

function Field({
  id,
  label,
  optional = false,
  error,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly optional?: boolean;
  readonly error: string | undefined;
  readonly children: ReactElement;
}): ReactElement {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-semibold">
        {label}
        {optional ? <span className="font-normal text-ink-3"> (optional)</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

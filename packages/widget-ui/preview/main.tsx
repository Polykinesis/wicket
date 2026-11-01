/**
 * The preview harness: every widget state from fixtures, rendered the way the
 * embed will render it (a shadow root with the compiled stylesheet injected as
 * text, inside a hostile host page), switched with query parameters.
 *
 * Served by `pnpm --filter @cf-chat/widget-ui preview`. Not shipped.
 *
 * Connection states (loading, verifying, refused, offline) are absent until
 * Phase 2 gives `Widget` a connection prop; add them here when it does.
 */
import type { EscalationRule } from "@cf-chat/shared/reply";
import { err, ok } from "@cf-chat/shared/result";
import { type ReactElement, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import css from "../dist/widget.css?raw";
import { countPropertyRules } from "../scripts/shadow-css.ts";
import type { LauncherVariant } from "../src/components/Panel.tsx";
import { Shell } from "../src/embed/Shell.tsx";
import type { HandoffError, SubmitHandoff } from "../src/handoff.ts";
import type { WidgetScope } from "../src/scope.ts";
import { deriveTurn, type TurnView } from "../src/turn.ts";
import { Widget } from "../src/Widget.tsx";
import {
  assistant,
  escalation,
  NOW,
  richCitation,
  SCOPE,
  sources,
  text,
  wireCitation,
} from "../test/fixtures.ts";

const QUESTION = "Can I pause my subscription over summer?";
const ANSWER =
  "Yes. You can pause any paid plan for up to 3 months a year. While paused, your rotas stay readable but you cannot publish new ones, and billing resumes automatically when the pause ends.";

const wire = () =>
  sources(wireCitation("c1", "Billing and plans"), wireCitation("c2", "Pausing and resuming"));
const rich = () =>
  sources(
    richCitation("c1"),
    richCitation("c2", {
      title: "Pausing and resuming",
      used: false,
      quote: null,
      excerpt: "Resuming early is free. Resuming after the pause ends happens on its own.",
    }),
  );

const escalated = (rule: EscalationRule, signal: 1 | 2 | 3) =>
  escalation({ escalated: true, signal, rule, reason: "preview fixture" });

/** The server's canned handoff sentence, which the UI drops and replaces. */
const canned = () => text("I will pass this to the team.");

const TURN_STATES = {
  empty: [],
  searching: [deriveTurn(QUESTION, undefined, "submitted")],
  searching_sources: [deriveTurn(QUESTION, assistant(wire()), "streaming")],
  streaming: [deriveTurn(QUESTION, assistant(wire(), text(ANSWER.slice(0, 70))), "streaming")],
  answered: [deriveTurn(QUESTION, assistant(wire(), text(ANSWER)), "ready")],
  answered_rich: [deriveTurn(QUESTION, assistant(rich(), text(ANSWER)), "ready")],
  partial: [
    deriveTurn(
      QUESTION,
      assistant(wire(), text(ANSWER), escalated("below_confidence_threshold", 2)),
      "ready",
    ),
  ],
  partial_uncovered: [
    deriveTurn(
      QUESTION,
      assistant(
        rich(),
        text(ANSWER),
        escalation({
          escalated: false,
          coverage: "partial",
          uncovered: "whether paused months count toward the yearly limit",
        }),
      ),
      "ready",
    ),
  ],
  dropped: [deriveTurn(QUESTION, assistant(wire(), text(ANSWER.slice(0, 90))), "error")],
  not_found: [
    deriveTurn(
      "Do you integrate with Xero payroll?",
      assistant(wire(), escalated("below_retrieval_threshold", 1), canned()),
      "ready",
    ),
  ],
  person_asked: [
    deriveTurn(
      "Can I talk to someone?",
      assistant(escalated("asked_for_human", 3), canned()),
      "ready",
    ),
  ],
  person_sensitive: [
    deriveTurn(
      "I want a refund for last month",
      assistant(escalated("sensitive_topic", 3), canned()),
      "ready",
    ),
  ],
  unavailable: [deriveTurn(QUESTION, assistant(escalated("retrieval_failed", 1)), "ready")],
  failed: [deriveTurn(QUESTION, assistant(), "error")],
  conversation: [
    deriveTurn(QUESTION, assistant(wire(), text(ANSWER)), "ready"),
    deriveTurn(
      "Do you integrate with Xero payroll?",
      assistant(wire(), escalated("below_retrieval_threshold", 1), canned()),
      "ready",
    ),
    deriveTurn("How do I add a second manager?", assistant(rich(), text(ANSWER)), "ready"),
    deriveTurn("And remove one?", undefined, "submitted"),
  ],
} satisfies Record<string, readonly TurnView[]>;

const SCOPES = {
  full: SCOPE,
  small: { ...SCOPE, documentCount: 5 },
  no_questions: { ...SCOPE, suggestedQuestions: undefined },
  bare: { tenantName: "Acme" },
} satisfies Record<string, WidgetScope>;

const LAUNCHERS = { labelled: "labelled", icon: "icon" } satisfies Record<string, LauncherVariant>;

const OPEN = { yes: true, no: false } satisfies Record<string, boolean>;

const HANDOFFS = {
  ok: null,
  rate_limited: { kind: "rate_limited" },
  unavailable: { kind: "unavailable" },
  invalid: { kind: "invalid", field: "email", message: "That address bounced last time" },
} satisfies Record<string, HandoffError | null>;

/** Every switchable dimension, keyed by its query parameter. */
const PARAMS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  state: TURN_STATES,
  scope: SCOPES,
  launcher: LAUNCHERS,
  open: OPEN,
  handoff: HANDOFFS,
};

/** Read `?name=` against its table, defaulting to the table's first key. */
function pick<T>(search: URLSearchParams, name: string, table: Readonly<Record<string, T>>): T {
  const first = Object.keys(table)[0];
  if (first === undefined) {
    throw new Error(`preview: empty table for ${name}`);
  }
  const requested = search.get(name);
  const key = requested !== null && requested in table ? requested : first;
  const value = table[key];
  if (value === undefined) {
    throw new Error(`preview: no ${name} named ${key}`);
  }
  return value;
}

function fakeHandoff(failure: HandoffError | null): SubmitHandoff {
  return async (input) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return failure ? err(failure) : ok({ reference: "NR-4F2K", email: input.email });
  };
}

function Preview({ search }: { readonly search: URLSearchParams }): ReactElement {
  const [open, setOpen] = useState(pick(search, "open", OPEN));
  const [turns, setTurns] = useState<readonly TurnView[]>(pick(search, "state", TURN_STATES));
  return (
    <Shell open={open}>
      <Widget
        scope={pick(search, "scope", SCOPES)}
        turns={turns}
        open={open}
        onOpenChange={setOpen}
        onAsk={(question) =>
          setTurns((current) => [...current, deriveTurn(question, undefined, "submitted")])
        }
        onSubmitHandoff={fakeHandoff(pick(search, "handoff", HANDOFFS))}
        launcher={pick(search, "launcher", LAUNCHERS)}
        now={NOW}
      />
    </Shell>
  );
}

/** Fill the host page's switcher from the same tables, so they cannot drift. */
function wireSwitcher(search: URLSearchParams): void {
  for (const select of document.querySelectorAll<HTMLSelectElement>("select[data-param]")) {
    const name = select.dataset.param;
    const table = name === undefined ? undefined : PARAMS[name];
    if (name === undefined || table === undefined) {
      continue;
    }
    const keys = Object.keys(table);
    const current = search.get(name) ?? keys[0];
    for (const key of keys) {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = key;
      option.selected = key === current;
      select.append(option);
    }
    select.addEventListener("change", () => {
      const next = new URLSearchParams(window.location.search);
      next.set(name, select.value);
      window.location.search = next.toString();
    });
  }
}

function mount(): void {
  const search = new URLSearchParams(window.location.search);
  wireSwitcher(search);

  const host = document.getElementById("widget-host");
  if (host === null) {
    throw new Error("preview: #widget-host missing");
  }

  // Same shape as the embed's `mountWidget` will use: open shadow root, the
  // compiled stylesheet as a <style>, React rendered into a child of the root.
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = css;
  const container = document.createElement("div");
  // The inheritance boundary, see `.widget-root` in styles.css.
  container.className = "widget-root";
  shadow.append(style, container);

  createRoot(container).render(
    <StrictMode>
      <Preview search={search} />
    </StrictMode>,
  );

  // Browsers ignore @property inside a shadow root, so the rules themselves
  // are inert here; what matters is that the build left Tailwind's fallback
  // block ungated. See scripts/shadow-css.ts.
  const ungated = /@layer properties\{\*,/.test(css);
  console.info(
    `widget.css: ${css.length} bytes, ${countPropertyRules(css)} inert @property rule(s), ` +
      `fallback ${ungated ? "ungated" : "STILL GATED: borders and shadows will be missing"}`,
  );
}

mount();

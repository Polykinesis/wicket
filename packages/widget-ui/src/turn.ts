import type { EscalationRule } from "@cf-chat/shared/reply";
import type { ChatStatus, UIMessage } from "ai";
import {
  type Citation,
  ESCALATION_PART,
  type EscalationData,
  escalationDataSchema,
  SOURCES_PART,
  sourcesDataSchema,
} from "./parts.ts";

/**
 * What one visitor question looks like on screen.
 *
 * Derived, never stored: the source of truth is the `UIMessage` list the chat
 * hook already holds, and a second copy of the state would drift from it the
 * first time a stream resumes after reconnecting.
 *
 * `cited` are the sources the answer rests on, `searched` the rest. Today the
 * server does not say which is which (ADR-017 adds `used`), so the first
 * distinct source counts as cited and the others as searched.
 */
export type TurnView =
  | {
      readonly kind: "searching";
      readonly question: string;
      readonly searched: readonly Citation[];
    }
  | {
      readonly kind: "answered";
      readonly question: string;
      readonly text: string;
      readonly streaming: boolean;
      readonly cited: readonly Citation[];
      readonly searched: readonly Citation[];
    }
  | {
      readonly kind: "partial";
      readonly question: string;
      readonly text: string;
      readonly cited: readonly Citation[];
      readonly searched: readonly Citation[];
      /** The part the sources do not cover, when the model said (ADR-017). */
      readonly uncovered: string | null;
    }
  | {
      readonly kind: "not_found";
      readonly question: string;
      readonly searched: readonly Citation[];
    }
  | {
      readonly kind: "person_requested";
      readonly question: string;
      /** `sensitive` is refunds, cancellations, legal: signal 3's keyword rules. */
      readonly why: "asked" | "sensitive";
    }
  | { readonly kind: "unavailable"; readonly question: string }
  | { readonly kind: "failed"; readonly question: string };

export type TurnKind = TurnView["kind"];

/**
 * Pair each visitor message with the assistant message after it, and derive
 * the view for each pair. Only the last turn can still be in flight, so only it
 * looks at `status`.
 */
export function buildTurns(messages: readonly UIMessage[], status: ChatStatus): TurnView[] {
  const turns: TurnView[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (message?.role !== "user") {
      continue;
    }
    const next = messages[i + 1];
    const reply = next?.role === "assistant" ? next : undefined;
    const isLast = messages.slice(i + 1).every((m) => m.role !== "user");
    turns.push(deriveTurn(textOf(message), reply, isLast ? status : "ready"));
  }
  return turns;
}

export function deriveTurn(
  question: string,
  reply: UIMessage | undefined,
  status: ChatStatus,
): TurnView {
  const read = readReply(reply);
  const inFlight = status === "submitted" || status === "streaming";
  const { cited, searched } = splitCitations(read.citations);

  if (read.escalation?.escalated === true) {
    return fromEscalation(question, read, read.escalation.rule, cited, searched);
  }

  if (read.modelText.length === 0) {
    if (inFlight) {
      return { kind: "searching", question, searched: read.citations };
    }
    // Finished, nothing said and nothing escalated: the turn died somewhere.
    return { kind: "failed", question };
  }

  if (status === "error") {
    // Text had started and the stream broke. runTurn finishes a mid-stream
    // model failure as an escalation, so arriving here means the socket went,
    // not the model. Show what arrived, offer the person.
    return { kind: "partial", question, text: read.modelText, cited, searched, uncovered: null };
  }

  if (read.escalation?.coverage === "partial") {
    return {
      kind: "partial",
      question,
      text: read.modelText,
      cited,
      searched,
      uncovered: read.escalation.uncovered?.trim() || null,
    };
  }

  return {
    kind: "answered",
    question,
    text: read.modelText,
    streaming: inFlight,
    cited,
    searched,
  };
}

function fromEscalation(
  question: string,
  read: ReadReply,
  rule: EscalationRule,
  cited: readonly Citation[],
  searched: readonly Citation[],
): TurnView {
  switch (rule) {
    case "no_chunks":
    case "below_retrieval_threshold":
      // Everything retrieved was below the bar, so none of it was cited.
      return { kind: "not_found", question, searched: read.citations };
    case "retrieval_failed":
      return { kind: "unavailable", question };
    case "asked_for_human":
      return { kind: "person_requested", question, why: "asked" };
    case "sensitive_topic":
      return { kind: "person_requested", question, why: "sensitive" };
    case "no_self_report":
    case "model_requested_human":
    case "below_confidence_threshold":
      // Signal 2. If the model's text arrived before the escalation, the
      // visitor has an answer the model was not sure of: partial. If nothing
      // came first, the generator failed before speaking (runTurn reuses
      // `no_self_report` for that), which to a visitor is "unavailable".
      return read.modelText.length > 0
        ? { kind: "partial", question, text: read.modelText, cited, searched, uncovered: null }
        : { kind: "unavailable", question };
    default: {
      const exhaustive: never = rule;
      throw new Error(`Unhandled escalation rule ${String(exhaustive)}`);
    }
  }
}

interface ReadReply {
  readonly citations: readonly Citation[];
  readonly escalation: EscalationData | null;
  /**
   * Text that arrived before any escalation part. runTurn writes its canned
   * handoff sentence *after* the escalation, and the UI owns that copy, so
   * anything after an escalation is not the model's answer and is dropped.
   */
  readonly modelText: string;
}

function readReply(reply: UIMessage | undefined): ReadReply {
  let citations: Citation[] = [];
  let escalation: EscalationData | null = null;
  let modelText = "";

  for (const part of reply?.parts ?? []) {
    if (part.type === "text") {
      if (escalation?.escalated !== true) {
        modelText += part.text;
      }
    } else if (part.type === SOURCES_PART) {
      const parsed = sourcesDataSchema.safeParse(part.data);
      if (parsed.success) {
        citations = dedupeById(parsed.data.sources);
      } else {
        // A malformed part is our own server's bug, not the visitor's problem.
        // Render without sources rather than failing the turn, but say so.
        console.warn("widget: ignored malformed data-sources part", parsed.error.issues);
      }
    } else if (part.type === ESCALATION_PART) {
      const parsed = escalationDataSchema.safeParse(part.data);
      if (parsed.success) {
        escalation = parsed.data;
      } else {
        console.warn("widget: ignored malformed data-escalation part", parsed.error.issues);
      }
    }
  }

  return { citations, escalation, modelText: modelText.trim() };
}

/**
 * The server sends one citation per retrieved chunk, and several chunks often
 * come from the same document, so the same source id repeats. First wins,
 * which is the best-ranked chunk.
 */
function dedupeById(citations: readonly Citation[]): Citation[] {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    if (seen.has(citation.id)) {
      return false;
    }
    seen.add(citation.id);
    return true;
  });
}

function splitCitations(citations: readonly Citation[]): {
  cited: readonly Citation[];
  searched: readonly Citation[];
} {
  if (citations.some((citation) => citation.used !== null)) {
    return {
      cited: citations.filter((citation) => citation.used === true),
      searched: citations.filter((citation) => citation.used !== true),
    };
  }
  return { cited: citations.slice(0, 1), searched: citations.slice(1) };
}

function textOf(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

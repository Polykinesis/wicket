import type { UIMessage } from "ai";
import type { WidgetScope } from "../src/scope.ts";

/**
 * Message builders shaped like what `Conversation.onChatMessage` writes, in the
 * order `runTurn` produces it: sources, then text or an escalation, and for a
 * pre-generation escalation the canned handoff text *after* the escalation.
 */

type Part = UIMessage["parts"][number];

let counter = 0;
const nextId = (): string => {
  counter += 1;
  return `m${counter}`;
};

export function user(text: string): UIMessage {
  return { id: nextId(), role: "user", parts: [{ type: "text", text }] };
}

export function assistant(...parts: Part[]): UIMessage {
  return { id: nextId(), role: "assistant", parts };
}

export function text(value: string): Part {
  return { type: "text", text: value };
}

export function sources(...items: unknown[]): Part {
  return { type: "data-sources", id: nextId(), data: { sources: items } };
}

export function escalation(data: unknown): Part {
  return { type: "data-escalation", id: nextId(), data };
}

/** Today's wire shape: no excerpt, no quote, a score the UI must drop. */
export function wireCitation(id: string, title: string, url: string | null = null) {
  return { id, title, url, score: 0.82 };
}

/** ADR-017's shape. */
export function richCitation(
  id: string,
  overrides: Partial<{
    title: string;
    url: string | null;
    excerpt: string;
    quote: string | null;
    indexedAt: string;
    used: boolean;
  }> = {},
) {
  return {
    id,
    title: "Billing and plans",
    url: null,
    excerpt:
      "You can pause any paid plan for up to 3 months a year. While paused, your rotas stay readable.",
    quote: "pause any paid plan for up to 3 months a year",
    indexedAt: "2026-10-28T09:00:00Z",
    used: true,
    ...overrides,
  };
}

export const NOW = new Date("2026-11-01T12:00:00Z");

export const SCOPE: WidgetScope = {
  tenantName: "Northwind Rota",
  documentCount: 42,
  updatedAt: "2026-10-30T12:00:00Z",
  topics: ["Pricing", "Setup", "Refunds", "Integrations"],
  suggestedQuestions: ["Can I pause my subscription over summer?"],
  ownerName: "Sam",
  replyTime: "within 4 hours",
};

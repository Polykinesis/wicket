import type { Result } from "@cf-chat/shared/result";
import { z } from "zod";

/**
 * What a visitor hands over when the widget cannot answer.
 *
 * Validated here for inline errors and again on the server, which is the check
 * that counts. Email is the only way the reply reaches them, so it is the only
 * required contact field.
 */
export const handoffInputSchema = z.object({
  email: z.email("Enter an email address so the reply can reach you"),
  name: z
    .string()
    .trim()
    .max(100, "Keep the name under 100 characters")
    .transform((value) => value || null),
  question: z
    .string()
    .trim()
    .min(1, "Say what you would like answered")
    .max(2000, "Keep the question under 2,000 characters"),
});
export type HandoffInput = z.infer<typeof handoffInputSchema>;
export type HandoffField = keyof z.input<typeof handoffInputSchema>;

export type HandoffError =
  | { readonly kind: "rate_limited" }
  | { readonly kind: "unavailable" }
  /** The server disagreed with a field the client accepted. */
  | { readonly kind: "invalid"; readonly field: HandoffField; readonly message: string };

export interface HandoffReceipt {
  /** Short, visitor-facing. Shown so they can quote it in a follow-up. */
  readonly reference: string;
  readonly email: string;
}

/**
 * Supplied by the embed, which owns the transport. The components only render
 * and validate, so they stay testable with a fixture implementation.
 */
export type SubmitHandoff = (input: HandoffInput) => Promise<Result<HandoffReceipt, HandoffError>>;

export function handoffErrorMessage(error: HandoffError): string {
  switch (error.kind) {
    case "rate_limited":
      return "Too many messages in a short time. Try again in a minute.";
    case "unavailable":
      return "That did not send. Your message is still here, try again.";
    case "invalid":
      return error.message;
    default: {
      const exhaustive: never = error;
      throw new Error(`Unhandled handoff error ${JSON.stringify(exhaustive)}`);
    }
  }
}

import { pageContextSchema } from "@cf-chat/shared";
import type { UIMessage } from "ai";
import { z } from "zod";

/**
 * The page the visitor was on when they asked, as the widget reported it in
 * `UIMessage.metadata.page`. Client-supplied, so parsed strictly and used as
 * data only: the title goes to the prompt inside its own delimiter, the path
 * goes on the span. Query strings never arrive (the schema refuses them) and
 * the host is dropped here, so a trace carries `/pricing`, not a URL.
 */
export interface VisitorPage {
  readonly title: string | null;
  readonly path: string;
}

const metadataSchema = z.object({ page: pageContextSchema }).partial();

export function readVisitorPage(message: UIMessage | undefined): VisitorPage | null {
  if (message?.role !== "user") {
    return null;
  }
  const parsed = metadataSchema.safeParse(message.metadata);
  if (!parsed.success || !parsed.data.page) {
    return null;
  }
  const { url, title } = parsed.data.page;
  const trimmed = title.trim();
  return { title: trimmed.length > 0 ? trimmed : null, path: new URL(url).pathname };
}

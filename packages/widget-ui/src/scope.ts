import type { WidgetScope } from "@cf-chat/shared/widget";

export type { WidgetScope };

/*
 * Copy derived from `WidgetScope`: the header line, the launcher label and who
 * a handoff goes to. The schema itself lives in `@cf-chat/shared/widget`,
 * because the `widget` Worker and the dashboard validate the same shape.
 */

/** Below this, a count reads as thin rather than as proof. A guess; revisit. */
export const SMALL_SITE_THRESHOLD = 10;

/** How many topics fit in the launcher label before it crowds the host page. */
const LAUNCHER_TOPICS = 3;

/**
 * The header line under the title. `null` when there is nothing true to say,
 * in which case the header shows the title alone.
 */
export function scopeLine(scope: WidgetScope, now: Date): string | null {
  const updated = scope.updatedAt ? relativeTime(new Date(scope.updatedAt), now) : null;
  const count = scope.documentCount;

  let what: string | null = null;
  if (count !== undefined && count >= SMALL_SITE_THRESHOLD) {
    what = `Answers from ${count} documents published by ${scope.tenantName}`;
  } else if (count !== undefined && count > 0) {
    what = `Answers from ${scope.tenantName}'s published help content`;
  }

  if (what && updated) {
    return `${what}, updated ${updated}`;
  }
  return what;
}

export function launcherLabel(scope: WidgetScope): string {
  const topics = scope.topics?.slice(0, LAUNCHER_TOPICS) ?? [];
  if (topics.length === 0) {
    return "Ask a question";
  }
  return `Ask about ${joinList(topics.map((topic) => topic.toLowerCase()))}`;
}

export function handoffRecipient(scope: WidgetScope): string {
  return scope.ownerName ?? `the ${scope.tenantName} team`;
}

function joinList(items: readonly string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/**
 * "2 days ago", "yesterday". `now` is injected so tests and the server agree on
 * what time it is. Anything under a minute, or a clock-skewed future date,
 * reads as "just now" rather than "in 3 seconds".
 */
export function relativeTime(then: Date, now: Date): string {
  const seconds = Math.round((then.getTime() - now.getTime()) / 1000);
  if (Number.isNaN(seconds) || seconds > -60) {
    return "just now";
  }
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.round(seconds / size), unit);
    }
  }
  return "just now";
}

/** "28 Oct" for a source's "as of" line. Year only when it is not this year. */
export function shortDate(iso: string, now: Date): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(date);
}

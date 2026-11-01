# Widget C prototype: verdict

The prototype HTML is gone. The real components in `src/` were checked against
it in a shadow root on a hostile host page (`preview/`, `pnpm preview`) on
2026-11-01, desktop and 390px, and read as option C. This file stays as the
record of why the widget looks the way it does.

## Question

The widget is a chat popup, and a chat popup looks like every chat popup since
2015. Can the UI itself communicate "answers only from what you have published,
shows where, says so when it cannot", rather than relying on marketing copy the
visitor never reads?

## Verdict: option C

A labelled pill launcher, then a panel with no persona, source-first answer
cards, and "not found" designed as a state rather than an error.

Rejected: A (a restyled messenger: still reads as 2015) and B (an inline ask
bar: needs the site owner to place it in their layout, which kills a one-line
install for a self-serve buyer).

## Decisions taken

| Case | Decision |
| --- | --- |
| Opening state | Scope line instead of a greeting: what it has read and how recently |
| Answer layout | Quoted source sentence first, highlighted, then the answer |
| Partial coverage | Answer what is covered, offer to send only the rest to a person |
| Stale source | "as of" date on every source; no detection of changes since indexing |
| Small sites | Under 10 documents, name the tenant instead of counting |
| Suggested questions | Real top-asked questions only; topics until a tenant has 20+ |
| Mobile | Full-screen panel; excerpt sits inside the card, so layout is the same |
| Confidence | Never shown as a number; mapped to discrete states |
| Highlight source | Model quotes the sentence, the server verifies it word for word (ADR-017) |
| Styling | Tailwind v4 |

## What the prototype got wrong, found in the code

- **"42 pages of acme.com"** assumed crawled web pages. Sources are uploaded
  files, so the copy counts documents, and `url` is always `null` today.
  Citations render a title without a link until website ingestion exists.
- **The searching state needs no backend change.** `runTurn` already emits
  `sources` before any text, forwarded as `data-sources`.
- **Excerpt, highlight, "as of" date and partial coverage are not on the wire.**
  ADR-017 (proposed) adds them; `src/` treats them as optional.

## What the preview harness changed

- Topics in the empty state were bordered pills and read as buttons. They are
  now a plain separated list: a statement of coverage, not a filter.
- The disclaimer and "Talk to a person" stack at phone width instead of
  wrapping mid-sentence beside each other.
- Two things the prototype could not show, because it was not in a shadow
  root: Tailwind's `@property` registrations are ignored there (fixed at build
  time, see `scripts/shadow-css.ts`) and host-page `*` rules inherit through
  the host element (fixed with `.widget-root`, see `styles.css`).

## Open

- Label width: the labelled pill is about 350px on desktop and nearly full
  width on a phone. An icon-only variant exists (`launcher="icon"`); the
  setting that selects it is Phase 1.
- Thresholds of 10 documents and 20 questions are guesses. Revisit with real
  tenants.

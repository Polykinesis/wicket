# cf-chat (working name)

An AI assistant for small-business websites that only answers from what the
business has actually published, hands everything else to the owner, and tells
the owner each week what visitors asked that the site does not answer.

Pre-launch. Target: public launch 13 Jan 2027, go / reposition / stop decision
23 Jan 2027. Developer setup is at the bottom of this file.

## What it does, in plain words

Most small businesses get the same twenty questions over and over: do you open
Saturdays, how much is a consultation, do you deliver to my postcode, can I
book for a group. When a visitor asks one of those at 9pm and nobody answers,
they leave and book somewhere else.

This puts a small chat window on your website that answers those questions
from your own pages and any FAQ or price list you upload, with a link to the
page the answer came from. Before it goes live you see its answers to the ten
questions people are most likely to ask, and you approve or correct each one.
Then one line of code, or the WordPress plugin, puts it on your site.

It does four jobs:

1. **Answers.** Grounded replies from your site's content, each linking the page
   it came from.
2. **Captures leads.** When a visitor wants a quote, a booking or a callback, it
   collects their name, contact details and a one-line summary. Bookings link
   out to the tool you already use (Calendly, Cal.com, Wix Bookings).
3. **Hands off.** Anything it is not sure about becomes an email to you with the
   transcript. Your reply can be saved as a new answer in one click, so the
   same question never reaches you twice.
4. **Reports.** One email a week: what was asked, what it could not answer, and
   the leads it captured.

## What it does that other tools don't quite do

The chat window itself is a commodity. Tidio, Intercom, Chatbase, Boei and a
dozen WordPress plugins all have one. These are the parts they don't lead with.

| | This | Tidio + Lyro | Intercom Fin | Chatbase | Boei |
|---|---|---|---|---|---|
| How AI is charged | One flat price, fair-use cap | Separate AI conversation meter | $0.99 per resolution | Message credits, varies by model | Message cap |
| Won't invent prices or hours | Hard rule: quoted only word-for-word from your content, otherwise handed off | No stated rule | No stated rule | No stated rule | No stated rule |
| You approve answers before visitors see them | Yes, at setup and on every handoff | No | No | No | No |
| Weekly "questions your site can't answer" report | Included | No | Pro add-on (Fin Operator) | No | No |
| Remove "powered by" badge | Included | Paid tier | Paid tier | $39 to $199/mo extra | Paid tier |
| Where conversations are processed | Cloudflare's network, open-weight model, no OpenAI sub-processor | Varies | OpenAI | Varies by model | Varies |

Competitor figures are from each vendor's public pricing as of October 2026
and will drift. The hard rule on prices and the approve-before-live flow are
designed and in the build plan, not yet shipped. See the status section.

The honest version of the pitch: it is not smarter than the others. It is
built to be wrong less often, to say "I don't know" rather than guess, and to
turn every "I don't know" into a line you can add to your site. Over a few
months your website ends up answering the questions your customers actually
ask, because the assistant kept a list.

Under the hood that is three escalation signals (no good match found, the
model's own confidence report, and plain rules like "they asked for a human"),
each logged with its inputs, and a bias towards handing off rather than
answering confidently. A wrong answer about a price costs you a customer. An
unnecessary handoff costs you a minute.

## Who it is for

- **First:** UK service businesses with 1 to 20 staff on WordPress. Trades,
  studios, consultancies, venues, local retail. Repeat questions, leads lost
  after hours, nobody to maintain a chatbot.
- **Second:** freelancers and small agencies who look after many client sites
  and want a recurring line item they don't have to support themselves.
- **Not at launch:** regulated advice (health, legal, financial), where a wrong
  answer carries liability. Not a live-chat inbox for support teams: handoffs
  go to email, by design.

One price: $30 a month or $300 a year, 14-day trial, no meters. The first 20
paying customers get $15 a month for life in exchange for a 20-minute feedback
call.

## Status (1 November 2026)

Built and tested:

- Accounts, sign-in, multi-tenant data isolation.
- Knowledge upload and indexing (files, PDFs), with retries and clean deletes.
- The reply loop: retrieval, generation, citations, the three escalation
  signals, and an append-only log of every question and why it was or was not
  handed off.
- Widget security: site key, origin allowlist, bot check, signed visitor tokens.

In progress: the widget itself (the chat window).

Not started: paste-a-URL site onboarding, approve-before-live, the hard rule on
prices and hours, lead capture, handoff and weekly report emails, billing, the
dashboard views, the WordPress plugin, the free Website Gap Check tool.

## Milestones

Twelve weeks from Monday 3 November 2026. Weeks 8 and 9 are holiday buffer.

| Milestone | Date | Done when |
|---|---|---|
| M1 Foundations | Fri 7 Nov | Name and domain chosen. Widget merged. A test site is crawled and answered with page links in a dashboard preview. Landing page and waitlist live. 10 manual gap reports sent to real businesses. |
| M2 Trust features | Fri 21 Nov | Approve-before-live works. Hard rule on prices and hours enforced and tested. Handoffs arrive as email. Widget discloses it is an AI. Website Gap Check is public. 3 comparison pages live. |
| M3 Chargeable | Fri 5 Dec | Lead capture in the widget. Dashboard shows conversations, leads and gaps, and lets you edit an answer. Trial to paid works end to end. Weekly report sends. Privacy notice, terms, DPA template, 90-day transcript retention. |
| M4 Private beta | Fri 19 Dec | WordPress plugin submitted to the directory. 5 beta sites live. Tracing on. Evaluation set built from beta transcripts. |
| Buffer | 22 Dec to 2 Jan | Trade pages with live demos. Agency conversations. Fixes from beta. |
| M5 Public launch | Tue 13 Jan 2027 | 10 beta sites. 50 gap reports emailed. Launch on Product Hunt, Indie Hackers, WordPress communities. Founding 20 offer open. |
| M6 Decision | Fri 23 Jan 2027 | Every trial followed up. Continue, reposition or stop against the targets below. |

Targets for the decision on 23 Jan 2027, with the stop signal in brackets:
300 Gap Check runs (under 75), 40 trials started (under 15), 10 paying sites
(under 3), 70% of trials live on their site within 48 hours (under 40%), 80% of
beta conversations answered without handoff (under 60%), zero confirmed wrong
price or availability answers (any repeat after a fix), 3 or more organic
signups in the final week (none).

## After launch

Each stage is gated on the one before it earning its keep. None of this is
promised.

- **Wix.** Script tag works today via custom code. A Wix App Market listing,
  which must bill through Wix, comes after launch.
- **Agencies.** Referral codes first. A reseller dashboard only if two or more
  agencies ask for one.
- **The weekly brief and site journal.** The assistant grows into a named,
  disclosed AI webmaster: it watches uptime, plugin vulnerabilities, page speed
  and search visibility, and writes a two-minute weekly brief plus a dated
  journal both you and it write in. Read-only at first.
- **Acting on the site, with approval.** Plugin updates tested on a copy of the
  site first, visual diff, one-click rollback, every change described in plain
  words before it happens. This stage needs insurance and a second person on
  support before it starts.
- **Voice check-ins.** A weekly five-minute call, always disclosed as AI.
- **For bigger teams.** A shared inbox where staff join a conversation live, a
  hosted help centre built from the approved answers, a custom domain.

## For developers

AI support widget, help centre and shared inbox on Cloudflare Workers and Neon.
See `docs/plan.md` for scope and build order, `docs/architecture.md` for how
the pieces fit, `docs/decisions/` for why, and `docs/product.md` for
positioning and the cost model.

### Layout

| Path | What |
|---|---|
| `apps/app` | TanStack Start dashboard + Hono API. The main Worker. |
| `apps/widget` | Embed Worker: site key, origin and Turnstile gates, visitor tokens, WebSocket upgrade forwarded to `app`. |
| `packages/shared` | Branded ids, zod boundary schemas, `AppError`, `Result`, session, password and visitor-token primitives. |
| `packages/db` | Drizzle schema, migrations, Hyperdrive client, tenant-scoped repositories. |
| `packages/retrieval` | `Retriever` and `Indexer` interfaces, `AISearchRetriever`, `FixtureRetriever`. |
| `packages/reply-loop` | `runTurn`, escalation signals, `Generator` interface and `FixtureGenerator`. |
| `packages/widget-ui` | React 19 embed UI (in progress). |

### Commands

```sh
pnpm install
pnpm dev          # vite dev on :3000, widget runs as an auxiliary Worker
pnpm typecheck    # tsc across the workspace
pnpm lint         # biome check
pnpm format       # biome check --write
pnpm test         # vitest: node projects for packages, Workers pool for apps
```

Per package: `pnpm --filter @cf-chat/db generate` (new migration from schema
changes), `pnpm --filter @cf-chat/db migrate` (apply to Neon),
`pnpm --filter @cf-chat/app deploy`.

### First-time setup

1. **Create the account resources.** The Hyperdrive one needs your Neon
   credentials, so it is not something to paste into a shared shell.

   ```sh
   pnpm exec wrangler kv namespace create KV
   pnpm exec wrangler hyperdrive create cf-chat-neon --connection-string="postgres://app_user:...@...neon.tech/..."
   ```

   Put the returned ids into `apps/app/wrangler.jsonc`, replacing
   `REPLACE_WITH_KV_NAMESPACE_ID` and `REPLACE_WITH_HYPERDRIVE_ID`.

2. **Environment.** In `.env` at the repo root:

   ```
   DATABASE_URL=postgres://<owner>@<host>/<db>          # direct Neon, drizzle-kit only
   CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgres://app_user@<host>/<db>
   ```

   `DATABASE_URL` uses the owner role because migrations create objects.
   Everything else connects as `app_user`, which is what makes row level
   security meaningful later (ADR-009).

   In `apps/app/.dev.vars` (see `.dev.vars.example`): `SESSION_SECRET`.
   In production: `pnpm exec wrangler secret put SESSION_SECRET`.

3. **Migrate, then set the app role's password.** The password is deliberately
   not in the migration:

   ```sh
   pnpm --filter @cf-chat/db migrate
   psql "$DATABASE_URL" -c "ALTER ROLE app_user WITH LOGIN PASSWORD '<secret>';"
   ```

### CI

Workers Builds is configured in the Cloudflare dashboard against a GitHub
repository, so there is no CI file in the repo. Once a remote exists, connect
each Worker with:

| | `cf-chat-app` | `cf-chat-widget` |
|---|---|---|
| Root directory | `apps/app` | `apps/widget` |
| Build command | `pnpm install && pnpm build` | `pnpm install` |
| Deploy command | `pnpm exec wrangler deploy` | `pnpm exec wrangler deploy` |

### Notes

- `main` in `apps/app/wrangler.jsonc` points at `./src/server.ts`, deliberately,
  not at `@tanstack/react-start/server-entry` as the Cloudflare framework guide
  shows. That package export is a self-contained default entry that never imports
  our server file, so pointing `main` at it silently drops the Hono API and every
  named export while the build still succeeds. See ADR-010.
- `compatibility_date` is pinned to `2026-08-22` across dev, test and deploy.
  That is the newest date the test pool's bundled runtime accepts; letting the
  three drift is not worth the twelve days.
- Tests never touch live bindings. AI Search and Workers AI have no local
  emulation, and hitting them would burn allowance and make results
  nondeterministic, so `FixtureRetriever` and `FixtureGenerator` exist.
- Tests that need Postgres are guarded on `TEST_DATABASE_URL` and skip without
  it. Hyperdrive has no local emulation either.

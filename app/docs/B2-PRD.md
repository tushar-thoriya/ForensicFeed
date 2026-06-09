# B2 — Weekly Email Digest

> **Phase:** B2 (Phase B — Enhancements)
> **Status:** DRAFT — ready for `/prp-plan`
> **Depends on:** Phase A complete (ingestion, relevance scoring, `papers` table) ✅
> **Skipped predecessor:** B1 (AI summaries) — deliberately not built; not a dependency.

---

## Problem Statement

ForensicFeed ingests relevant image-forgery papers every day, but surfacing them is
**pull-only** — I have to remember to open the site. On a busy week I can go days
without checking, which defeats the entire premise ("never miss a relevant paper").
There is no passive channel that brings new high-relevance papers to me.

## Evidence

- The whole product thesis (CLAUDE.md §1) is "so no relevant paper is ever missed,"
  yet the only way to see new papers today is to actively visit the feed.
- Daily arXiv ingest runs at 06:00 UTC unattended (`config/schedules.ts`), so fresh
  papers accumulate in the DB whether or not I look — they just sit there unseen.
- Single-user assumption: there is no notification surface of any kind in Phase A.

## Proposed Solution

A scheduled **Inngest cron job** that, once a week, queries the `papers` table for
high-relevance papers ingested in the last 7 days, renders a compact HTML email, and
sends it to my inbox via **Resend**. It reuses existing infrastructure end-to-end
(Inngest scheduling, the `papers` table + `relevanceScore`/`relevanceTags`, the
`ingest_runs`-style logging pattern) and adds no new database tables. The digest is
**high-relevance only** to stay short and signal-heavy.

## Key Hypothesis

We believe a **reliable weekly email of high-relevance new papers** will **close the
pull-only gap** for **the single user**.
We'll know we're right when **the digest lands every Monday with correct content and
no breakage** for several consecutive weeks.

## What We're NOT Building

- **AI one-line summaries (B1)** — deliberately skipped; the digest links to the
  abstract/PDF instead of summarizing.
- **Saved-keyword / per-topic preferences** — relevance score already encodes "what
  matters"; a preferences UI is a separate feature (deferred B-series item).
- **Multi-recipient / subscriber management / unsubscribe flows** — single-user tool.
- **Open/click tracking & email analytics** — no audience to measure.
- **Digest archive page in-app** — out of scope; the feed already shows the papers.
- **Configurable cadence UI** — cadence lives in `config/schedules.ts` (edit + deploy).

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Delivery reliability | Email sent on ≥ 4 of 4 consecutive Mondays | Inngest run history + inbox |
| Content correctness | 0 weeks with wrong/duplicate/missing papers vs feed | Manual spot-check against feed |
| No double-send | Exactly 1 email per week per run | Run is idempotent; logged + verified |
| Quiet-week handling | "No new papers" note sent (not silence) on empty weeks | Inbox on a zero-result week |

## Open Questions

- [ ] **Sender identity in Resend** — free tier without a verified domain sends from
      `onboarding@resend.dev`. Acceptable for a personal tool, or verify a domain?
      (Setup detail; does not block the build.)
- [ ] **Should the run write a row to a log table** (e.g. extend `ingest_runs`-style
      tracking to a `digest_runs` table) for an audit trail, or is the Inngest run
      history enough? Default: rely on Inngest history (no new table).

---

## Users & Context

**Primary User**
- **Who**: Me (Tushar) — the single user and operator of ForensicFeed.
- **Current behavior**: Manually open the site when I remember; risk gaps of several days.
- **Trigger**: Start of the work week — wanting to know "what new forgery-detection
  papers showed up while I wasn't looking."
- **Success state**: A short, scannable email is already in my inbox Monday morning;
  I skim it, click through to anything interesting, done.

**Job to Be Done**
When **a new week starts and I haven't checked the feed in days**, I want to **receive
the week's high-relevance new papers in my inbox**, so I can **stay current without
having to remember to visit the site**.

**Non-Users**
Anyone other than me. No public subscribers, no team — so no auth, no preference
storage, no unsubscribe, no per-user templating.

---

## Solution Detail

### Core Capabilities (MoSCoW)

| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | Weekly Inngest cron job wired through `config/schedules.ts` | Scheduling spine; matches existing ingest pattern |
| Must | "New + high-relevance" query (score ≥ threshold, `createdAt` within 7 days, sorted desc, capped) | Defines digest contents |
| Must | HTML email template (compact, editorial style, top cards + compact list) | The deliverable the user reads |
| Must | Send via Resend; recipient + API key from validated env | Delivery mechanism |
| Must | Idempotent / safe — never double-send on retry | Inngest retries steps; must not re-email |
| Must | Quiet-week note when zero results | Confirms the job is alive |
| Should | Env validation at boot (`RESEND_API_KEY`, recipient) with clear failure | Fail-fast per project rules |
| Should | Plain-text fallback part alongside HTML | Email client robustness |
| Could | `digest_runs` audit row | Nice for history; Inngest history may suffice |
| Won't | Preferences UI, summaries, tracking, multi-recipient | See "Not Building" |

### MVP Scope

The smallest thing that validates "reliable weekly email of correct papers":

1. One Inngest scheduled function (`weekly-digest`) on a Monday cron.
2. A query module returning the week's high-relevance papers (≥ 0.2, last 7 days by
   `createdAt`, newest/most-relevant first, cap 20).
3. An HTML+text template rendering those papers (title, authors, venue, score, tags,
   arXiv/PDF link, in-app detail link).
4. A Resend send call with env-driven recipient and key.
5. Idempotent send (one step computes the digest, one step sends; the send is keyed so
   a retry of the function doesn't produce a second email).
6. Quiet-week branch.

### User Flow

```
Monday 08:00 UTC
  → Inngest fires weekly-digest
  → step 1: query papers (score ≥ 0.2, createdAt ≥ now-7d), sort, cap 20
  → branch: 0 papers? render "quiet week" note : render digest
  → step 2: Resend.emails.send(to=DIGEST_RECIPIENT, html, text)  [idempotent]
  → return summary { papersIncluded, sent: true }
User: opens email → clicks a paper → arXiv/PDF or in-app detail page
```

---

## Technical Approach

**Feasibility**: **HIGH** — every building block already exists; this is composition,
not new architecture.

**Architecture Notes**
- **Scheduling**: add `digest` to `SCHEDULES` in `app/config/schedules.ts` (single
  source of truth) and a new `createFunction({ cron: SCHEDULES.digest })` mirroring
  `src/lib/inngest/ingest-arxiv.ts`. Register it alongside the other Inngest functions
  in the inngest route handler.
- **Query**: new `src/lib/email/digest-query.ts` using Drizzle against `papers`
  (`relevanceScore`, `createdAt`, ordering by `relevanceScore` desc). No schema change.
- **Template**: `src/lib/email/digest-template.ts` — pure function `(papers) => { html, text, subject }`, inline styles matching the editorial tokens (serif headings, mono meta). No React-email dependency needed; plain template keeps the bundle lean.
- **Send**: `resend` SDK (`pnpm add resend`). Thin wrapper `src/lib/email/send.ts`
  reading `RESEND_API_KEY` + `DIGEST_RECIPIENT` from the validated env module (`src/lib/env.ts`).
- **Idempotency**: split into Inngest `step.run` blocks. Because Inngest replays
  completed steps without re-executing them, putting the `send` in its own step means a
  function retry after the send won't re-send. (Validate this is sufficient during plan.)
- **Env**: `RESEND_API_KEY` already reserved in `.env.example`; add `DIGEST_RECIPIENT`.

**Technical Risks**

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Double-send on Inngest retry | M | Isolate send in its own `step.run`; verify replay semantics; consider idempotency key |
| Resend deliverability to Gmail (spam) | M | Verify sender / use reputable from-address; plain-text part; test send first |
| Email HTML renders poorly in Gmail | M | Inline styles only, table-free simple layout, test in Gmail before shipping |
| `createdAt` vs `publishedDate` confusion | L | Decision logged: window is `createdAt` (ingestion time) so late-discovered papers still appear |
| Empty/huge week | L | Quiet-week branch; hard cap of 20 papers |

---

## Implementation Phases

<!--
  STATUS: pending | in-progress | complete
-->

| # | Phase | Description | Status | Parallel | Depends | PRP Plan |
|---|-------|-------------|--------|----------|---------|----------|
| 1 | Query + env | `digest-query.ts`, `DIGEST_RECIPIENT` env, validation; unit tests | complete | with 2 | - | `docs/B2-PHASE1-PLAN.md` |
| 2 | Template | `digest-template.ts` (html+text+subject), quiet-week variant; unit tests | complete | with 1 | - | `docs/B2-PHASE2-PLAN.md` |
| 3 | Send + job | `send.ts` Resend wrapper + `weekly-digest` Inngest fn + schedule + register; idempotent | complete | - | 1, 2 | `docs/B2-PHASE3-PLAN.md` |
| 4 | Verify + ship | Local test send, Gmail render check, Resend key in Vercel, deploy, confirm cron | pending | - | 3 | - |

### Phase Details

**Phase 1: Query + env**
- **Goal**: Produce the exact list of papers a digest should contain.
- **Scope**: `digest-query.ts` (score ≥ 0.2, `createdAt` ≥ now−7d, order by relevance
  desc then date desc, limit 20); add `DIGEST_RECIPIENT` to env schema + `.env.example`.
- **Success signal**: Unit tests cover threshold boundary, 7-day boundary, ordering,
  cap, and empty result.

**Phase 2: Template**
- **Goal**: Turn a paper list into a sendable email.
- **Scope**: pure `(papers) => { subject, html, text }`; top-N full cards + compact
  remainder list; quiet-week variant; links to arXiv/PDF and in-app detail.
- **Success signal**: Snapshot/structure tests; renders with 0, 1, 20 papers; no
  unescaped user content (titles/authors escaped).

**Phase 3: Send + job**
- **Goal**: Wire query + template into a scheduled, idempotent send.
- **Scope**: `send.ts` Resend wrapper; `weekly-digest.ts` Inngest function on
  `SCHEDULES.digest`; register in the inngest handler; isolate send in its own step.
- **Success signal**: Manual trigger sends exactly one email; a simulated retry does
  not produce a second.

**Phase 4: Verify + ship**
- **Goal**: Confirm it works in production.
- **Scope**: test send to real inbox, Gmail render check, set `RESEND_API_KEY` +
  `DIGEST_RECIPIENT` in Vercel, deploy, confirm Inngest registers the cron.
- **Success signal**: A real email arrives, looks right in Gmail, and the cron is
  visible/scheduled in Inngest.

### Parallelism Notes

Phases 1 and 2 are independent (query logic vs template rendering) and can be built in
parallel; both feed Phase 3. Phase 4 is strictly last (needs the real Resend key).

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Digest scope | High-relevance only (≥ 0.2) | All new papers; per-topic | Short, signal-heavy; matches feed threshold |
| "New" window | `createdAt` last 7 days | `publishedDate` | Late-discovered papers still surface; never miss one |
| Schedule | Monday 08:00 UTC | Sunday; daily | Weekend papers are in; ~1:30 PM IST |
| Quiet week | Send one-line note | Send nothing | Confirms the job is alive |
| Success metric | Reliable delivery | Engagement; catch-rate | Single-user; reliability is the honest first bar |
| Summaries | None (skip B1) | Haiku summaries | User explicitly does not want them now |
| New DB tables | None | `digest_runs` | YAGNI; Inngest run history is enough for v1 |
| Email lib | `resend` SDK | nodemailer/SMTP | Already chosen in stack; Vercel-friendly |
| Recipient | Single env value | Subscriber table | Single-user tool |

---

## Research Summary

**Market Context**
Weekly research-paper digests are a well-worn pattern (arXiv-sanity, Scholar Inbox,
Semantic Scholar's research feeds, Papers With Code newsletters). Common good practices:
keep it short and ranked, link out rather than inline full content, send on a fixed
weekday morning, and degrade gracefully on empty periods. Common anti-patterns: dumping
every paper (overwhelm), heavy HTML that breaks in Gmail, and no "nothing this week"
signal (user can't tell broken from quiet). This PRD adopts the good practices directly.

**Technical Context**
All infrastructure exists. Scheduling mirrors `src/lib/inngest/ingest-arxiv.ts`
(`inngest.createFunction({ cron: SCHEDULES.x }, ...)`), with cadence centralized in
`app/config/schedules.ts`. Data comes from the existing `papers` table — `relevanceScore`
(real, indexed via `papers_relevance_idx`), `relevanceTags` (jsonb), `createdAt`,
`publishedDate`, `pdfUrl`, `venue`, `authors`. `RESEND_API_KEY` is already a reserved
env var in `.env.example`; only `DIGEST_RECIPIENT` is new. No migration required.
Primary technical care-point is **idempotent sending** under Inngest step replay.

---

*Generated: 2026-06-09*
*Status: DRAFT — needs validation (sender identity, idempotency semantics)*

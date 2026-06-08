# A1 — arXiv adapter live + minimal feed UI

**Status:** In progress
**Date:** 2026-04-21
**Owner:** tusharpatel
**Supersedes:** prior V2 GitHub-trending draft (discarded)

## Goal

arXiv papers on image forgery detection flow end-to-end from arXiv → Supabase → the feed page, with relevance scoring applied at ingest time so the default feed only surfaces papers that clear the 0.2 threshold.

**Success shape:** I fire a manual ingest, the feed at `/` populates with real arXiv entries sorted newest-first, and irrelevant papers that slipped through the adapter's keyword filter are hidden because their relevance score is below 0.2.

## Scope

### In scope

- Wire `scoreRelevance` + `assignTags` from `src/lib/ingestion/tagger.ts` into `upsertPaper` so every inserted paper has a computed `relevance_score` and `relevance_tags[]`
- Apply relevance threshold (`minRelevance: 0.2`) to the feed query
- Add a manual-trigger HTTP route (`POST /api/ingest/arxiv`) that emits the `ingest/arxiv.manual` Inngest event — needed to seed data and for on-demand re-fetching
- Seed ingest (last 6 months, per `INGESTION_SEED_MONTHS`) via the manual route with `{ seed: true }`
- Render each paper as a `PaperCard` with: title, authors, venue/year, abstract preview, relevance score, tag badges, PDF link
- Unit tests for the scorer wiring in `upsertPaper` (new paper, existing paper re-score behavior)
- Integration smoke: manual run populates DB, feed reflects it

### Out of scope (later phases)

- Scheduled daily ingest triggered automatically — the `ingestArxivDaily` Inngest function is already defined but needs Inngest Cloud or local `inngest-cli dev` to actually fire. Not part of A1 done-criteria.
- Multiple sources (A2: PwC + Semantic Scholar)
- Filter sidebar / URL state (A5)
- Full-text search (A6)
- Saved papers + read status (A7)
- Paper detail page + design pass (A7)

## Existing state (what's already scaffolded)

| Piece                              | File                                           | Status                              |
| ---------------------------------- | ---------------------------------------------- | ----------------------------------- |
| arXiv Atom parser + adapter        | `src/lib/ingestion/adapters/arxiv.ts`          | ✅ Done                             |
| Adapter unit tests                 | `tests/unit/arxiv-adapter.test.ts`             | ✅ Done (3 tests)                   |
| Adapter fixture                    | `tests/fixtures/arxiv-feed.xml`                | ✅ Done                             |
| `runAdapter` orchestrator          | `src/lib/ingestion/run.ts`                     | ✅ Done                             |
| `upsertPaper` + `listRecentPapers` | `src/lib/db/queries/papers.ts`                 | ⚠️ Missing relevance wiring         |
| `startRun` / `finishRun`           | `src/lib/db/queries/ingest-runs.ts`            | ✅ Done                             |
| Inngest client + functions         | `src/lib/inngest/client.ts`, `ingest-arxiv.ts` | ✅ Done (daily cron + manual event) |
| Inngest API handler                | `src/app/api/inngest/route.ts`                 | ✅ Done                             |
| Relevance scorer + tagger          | `src/lib/ingestion/tagger.ts`                  | ✅ Done (21/21 tests)               |
| Feed page                          | `src/app/page.tsx`                             | ⚠️ Missing relevance threshold      |
| `PaperCard` / `PaperList`          | `src/components/feed/`                         | ⚠️ Needs tag + score display        |

## Deliverables

| #   | File                                | Purpose                                                                                                                                               |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/lib/db/queries/papers.ts`      | Wire `scoreRelevance` + `assignTags` into `upsertPaper`; write `relevanceScore` + `relevanceTags` to DB. Update `listRecentPapers` default threshold. |
| 2   | `src/app/page.tsx`                  | Pass `minRelevance: 0.2` when listing papers.                                                                                                         |
| 3   | `src/app/api/ingest/arxiv/route.ts` | `POST` → emits `ingest/arxiv.manual` Inngest event; accepts optional `{ seed: true }` in body for 6-month seed.                                       |
| 4   | `src/components/feed/PaperCard.tsx` | Show title, authors, venue/year, abstract preview, relevance score, tag badges, links.                                                                |
| 5   | `src/components/feed/feed.css`      | Styles for score badge + tag chips.                                                                                                                   |
| 6   | `tests/unit/upsert-paper.test.ts`   | Verify `upsertPaper` stores computed score and tags; re-score on update.                                                                              |

## Contracts

### `upsertPaper` behavior change

On **insert**: compute `score = scoreRelevance({title, abstract})` and `tags = assignTags({title, abstract})`. Persist both.
On **update**: re-compute score and tags (title/abstract may have changed in a new arXiv revision). Overwrite.

### `listRecentPapers` threshold

Default `minRelevance` stays at 0, but `app/page.tsx` passes `0.2` explicitly. This keeps the query helper flexible (detail pages can pass 0 to show below-threshold papers).

### `POST /api/ingest/arxiv` contract

```
POST /api/ingest/arxiv
Content-Type: application/json

{ "seed": true }   // optional — triggers 6-month backfill
```

Response (envelope from `common/patterns.md`):

```json
{ "success": true, "data": { "eventId": "..." } }
```

Auth: not in A1 (single-user, local/private). Revisit in A8 (production).

## Done when

- [ ] `POST /api/ingest/arxiv` with `{ "seed": true }` triggers Inngest manual event and eventually populates DB with ≥ 1 real arXiv paper (prod arXiv, not fixture)
- [ ] Every row in `papers` has `relevance_score` ≥ 0 and `relevance_tags` populated (may be `[]` for papers scoring below tag-trigger keywords)
- [ ] Feed at `/` shows only papers with score ≥ 0.2, sorted newest-first
- [ ] Each card shows title, authors, venue/year, score, tag chips, PDF link
- [ ] New unit test covers: (a) insert stores correct score+tags, (b) update re-scores on revision
- [ ] `pnpm typecheck` + `pnpm lint` clean
- [ ] `pnpm test tests/unit/` green
- [ ] `code-reviewer` + `typescript-reviewer` pass, no CRITICAL/HIGH open

## Non-goals / explicit deferrals

- Inngest Cloud setup / cron verification → A8
- Observability dashboard for ingest runs → A8
- Robust error UI for the feed (beyond the existing "connection issue" placeholder) → A7
- Filters (venue, year, tag, has-code) → A4/A5

## Risk notes

- **arXiv rate limit:** 1 req/sec preferred. A single seed run with `maxResults: 500 × 2 = 1000` may require multiple paginated requests (adapter currently does one page — fine for A1; pagination is a follow-up if seed undercounts).
- **Relevance threshold calibration:** 0.2 locked from V4 §5. If real arXiv data shows too many false positives or too few surviving papers, revisit after first seed run (adjust weights in `tagger.ts`, not the threshold).
- **Re-score on revision:** updating relevance on every upsert means a paper's score can drift as abstract is refined. Acceptable; alternative (snapshot at insert) would mask later keyword-list changes.

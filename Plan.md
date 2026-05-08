# Plan.md — Research Paper Tracker: Image Forgery Detection & Localization

> **Scope:** Phase A (A0–A9) full task breakdown · Phase B outline
> **Methodology:** PRP loop per sub-phase (see `CLAUDE.md §7`)
> **Spec:** `Ideas V4.md` · **Instructions:** `CLAUDE.md`
> **Last updated:** 2026-04-26

---

## How to Use This Plan

1. Work one sub-phase at a time. Never start the next until all quality gates pass.
2. Each task has: `ID` · `effort (S/M/L/XL)` · `→ dependency` · `agent hint`
3. Effort: **S** = <2h · **M** = 2–4h · **L** = 4–8h · **XL** = >8h
4. Run the 9-step PRP loop at the start of each sub-phase before any code.
5. Mark tasks done as you go — never batch-complete.

---

## Phase A — Single-User MVP

---

### A0 — Foundations & Planning

**Deliverable:** Repo clean, schema designed, adapter contracts written, skill docs created, hooks wired.

| ID | Task | Effort | Dep | Agent |
|---|---|---|---|---|
| A0-T1 | Write A0 PRD (`/prp-prd`) | S | — | planner |
| A0-T2 | Write V4 Drizzle schema (`papers`, `user_saves`, `read_status`, `ingest_runs`) | M | A0-T1 | code-architect |
| A0-T3 | Define adapter TypeScript interface contract (`fetch(since: Date) → Paper[]`) and unified `Paper` type | S | A0-T2 | architect |
| A0-T4 | Write unit tests for relevance scorer (keyword weight table, score cap 1.0, floor 0.2) | M | A0-T3 | tdd-guide |
| A0-T5 | Implement relevance scorer + tag auto-assigner (12 tags) — pass A0-T4 tests | M | A0-T4 | — |
| A0-T6 | Create `.agents/skills/paper-tracker-ingestion/SKILL.md` | S | A0-T3 | — |
| A0-T7 | Create `.agents/skills/paper-tracker-relevance/SKILL.md` | S | A0-T5 | — |
| A0-T8 | Update `app/src/lib/env.ts` with V4 env var schema (Zod) | S | A0-T2 | — |
| A0-T9 | Verify `.claude/settings.json` hooks fire correctly on a test file edit | S | — | — |
| A0-T10 | Code review | S | A0-T9 | code-reviewer + typescript-reviewer |

**Done when:** Schema reviewed, adapter contract defined, scorer tests green, skill docs exist, hooks verified.

---

### A1 — arXiv Adapter + Minimal Feed UI

**Deliverable:** Today's arXiv papers visible in browser. Last 6 months seeded.

| ID | Task | Effort | Dep | Agent |
|---|---|---|---|---|
| A1-T1 | Write A1 PRD + plan | S | — | planner |
| A1-T2 | Write unit tests for arXiv adapter (Atom XML parse, normalise, edge cases) | M | A0-T3 | tdd-guide |
| A1-T3 | Implement arXiv adapter (query `cs.CV` + `cs.CR`, parse Atom XML, normalise to `Paper`) | L | A1-T2 | — |
| A1-T4 | Implement seed mode (fetch last 6 months on first run via `since` param) | S | A1-T3 | — |
| A1-T5 | Wire Inngest daily job for arXiv (`ingest-arxiv.ts`) | S | A1-T3 | — |
| A1-T6 | Run Drizzle migration (create `papers` table) | S | A0-T2 | — |
| A1-T7 | Write minimal feed page (`app/(feed)/page.tsx`) — server component, no styling | M | A1-T6 | — |
| A1-T8 | Write `PaperCard` component (title, authors, venue, date, abstract 3-line excerpt, tags) | M | A1-T7 | — |
| A1-T9 | Write `PaperList` component | S | A1-T8 | — |
| A1-T10 | Integration test: ingest → DB write → page renders papers | M | A1-T9 | — |
| A1-T11 | Code review | S | A1-T10 | code-reviewer + typescript-reviewer |

**Done when:** Open browser, see today's new arXiv papers on image forgery. Seed run populated last 6 months.

---

### A2 — Hugging Face Papers + Semantic Scholar — DONE (pending real-API smoke + commit)

**Deliverable:** Three sources merged in one feed. Code links and citation counts visible. *Note: Papers With Code was migrated to Hugging Face Papers mid-A2; replaced PwC adapter with HF Papers adapter + a deterministic GitHub-URL extractor that mines arXiv abstracts for `code_url`.*

| ID | Task | Effort | Dep | Agent |
|---|---|---|---|---|
| A2-T1 | Write A2 PRD + plan | S | — | planner |
| A2-T2 | Write unit tests for deduplication logic (arxiv_id → doi → title hash) | M | A0-T3 | tdd-guide |
| A2-T3 | Implement deduplication (`lib/ingestion/dedup.ts`) — pass A2-T2 tests | M | A2-T2 | — |
| A2-T4 | Write unit tests for Papers With Code adapter | M | A0-T3 | tdd-guide |
| A2-T5 | Implement Papers With Code adapter (search by task + keywords, extract `code_url`) | L | A2-T4 | — |
| A2-T6 | Write unit tests for Semantic Scholar adapter | M | A0-T3 | tdd-guide |
| A2-T7 | Implement Semantic Scholar adapter (keyword search + citation count fetch) | L | A2-T6 | — |
| A2-T8 | Wire Inngest daily jobs for PwC + S2 | S | A2-T5, A2-T7 | — |
| A2-T9 | Add "has code" badge and citation count to `PaperCard` | S | A2-T5 | — |
| A2-T10 | Integration test: all 3 sources dedup correctly, no duplicates in DB | M | A2-T8 | — |
| A2-T11 | Code review | S | A2-T10 | code-reviewer + typescript-reviewer |

**Done when:** Papers from arXiv, PwC, and S2 appear merged. Code links show on papers that have implementations. No duplicates.

---

### A3 — CVF + OpenReview Adapters

**Deliverable:** Papers from CVPR, ICCV, WACV, ICLR, NeurIPS visible in feed.

| ID | Task | Effort | Dep | Agent |
|---|---|---|---|---|
| A3-T1 | Write A3 PRD + plan | S | — | planner |
| A3-T2 | Write unit tests for CVF scraping adapter (cheerio HTML parse) | M | A0-T3 | tdd-guide |
| A3-T3 | Implement CVF adapter (scrape CVPR/ICCV/WACV proceedings, filter by keyword in title) | L | A3-T2 | — |
| A3-T4 | Write unit tests for OpenReview adapter | M | A0-T3 | tdd-guide |
| A3-T5 | Implement OpenReview adapter (ICLR + NeurIPS via OpenReview REST API) | L | A3-T4 | — |
| A3-T6 | Wire Inngest weekly jobs for CVF + OpenReview (`ingest-conferences.ts`) | S | A3-T3, A3-T5 | — |
| A3-T7 | Add `venue_type` badge to `PaperCard` (arXiv / Conference / Workshop) | S | A3-T6 | — |
| A3-T8 | Integration test: conference papers appear correctly; weekly schedule verified | M | A3-T6 | — |
| A3-T9 | Code review | S | A3-T8 | code-reviewer + typescript-reviewer |

**Done when:** Can see papers from CVPR 2024 and ICLR 2024 on image forgery in the feed alongside arXiv papers.

---

### A4 — Relevance Scoring + Filter Sidebar

**Deliverable:** Papers sorted by relevance. Filter sidebar live with 8 dimensions. URL-synced.

| ID | Task | Effort | Dep | Agent |
|---|---|---|---|---|
| A4-T1 | Write A4 PRD + plan | S | — | planner |
| A4-T2 | Integrate relevance scorer + tagger into ingest pipeline (run at ingest time) | M | A0-T5 | — |
| A4-T3 | Backfill relevance scores + tags on existing papers (one-off migration script) | S | A4-T2 | — |
| A4-T4 | Add `relevance_score` sort to feed query (alongside newest-first default) | S | A4-T2 | — |
| A4-T5 | Write `useFilters` hook (filter state, URL sync via search params) | M | — | — |
| A4-T6 | Write `FilterSidebar` component (desktop, 8 filter dimensions) | L | A4-T5 | — |
| A4-T7 | Write `FilterSheet` component (mobile bottom sheet) | M | A4-T5 | — |
| A4-T8 | Write `FilterChips` component (active filters above feed) | S | A4-T5 | — |
| A4-T9 | Wire filters to feed query (client-side, target <50ms visual update) | M | A4-T6 | — |
| A4-T10 | Write `TagBadge` component (relevance tags on PaperCard) | S | — | — |
| A4-T11 | Unit tests: filter state logic, URL serialisation | M | A4-T5 | tdd-guide |
| A4-T12 | Code review | S | A4-T11 | code-reviewer + typescript-reviewer |

**Done when:** Can filter by venue (e.g., CVPR only), topic tag (e.g., localization), year (2024), has-code. Filters persist in URL. Tag badges visible on each card.

---

### A5 — Full-Text Search

**Deliverable:** Can search title + abstract. Results highlight keywords.

| ID | Task | Effort | Dep | Agent |
|---|---|---|---|---|
| A5-T1 | Write A5 PRD + plan | S | — | planner |
| A5-T2 | Drizzle migration: add `tsvector` column to `papers`, create GIN index | M | — | database-reviewer |
| A5-T3 | Write search API route (`/api/papers/search`) using `tsquery` | M | A5-T2 | — |
| A5-T4 | Write `SearchInput` component with debounce | S | — | — |
| A5-T5 | Write `useSearch` hook (debounce 300ms, min 2 chars) | S | — | — |
| A5-T6 | Keyword highlight in search results (mark matching terms in title/abstract) | M | A5-T4 | — |
| A5-T7 | Integration tests: search route returns correct results, ranking, empty state | M | A5-T3 | tdd-guide |
| A5-T8 | Code review | S | A5-T7 | code-reviewer + typescript-reviewer |

**Done when:** Search "copy-move localization" returns relevant papers with matched terms highlighted.

---

### A6 — Save + Read Status Tracking

**Deliverable:** Can bookmark papers and track reading progress. Saved papers view exists.

| ID | Task | Effort | Dep | Agent |
|---|---|---|---|---|
| A6-T1 | Write A6 PRD + plan | S | — | planner |
| A6-T2 | Drizzle migration: create `user_saves` + `read_status` tables | S | — | — |
| A6-T3 | Write API routes: `POST/DELETE /api/saves/[id]` | M | A6-T2 | — |
| A6-T4 | Write API route: `PATCH /api/read-status/[id]` | M | A6-T2 | — |
| A6-T5 | Write `SaveButton` component (toggle, optimistic update) | S | A6-T3 | — |
| A6-T6 | Write `ReadStatusToggle` component (unread → reading → read → archived) | M | A6-T4 | — |
| A6-T7 | Write `/saved` page (filterable list of saved papers) | M | A6-T5 | — |
| A6-T8 | Unit tests for save + read-status API routes | M | A6-T3, A6-T4 | tdd-guide |
| A6-T9 | Code review | S | A6-T8 | code-reviewer + typescript-reviewer |

**Done when:** Can save papers, mark as "reading", open `/saved` and see bookmarked list. Status persists on refresh.

---

### A7 — Paper Detail Page + Design Pass

**Deliverable:** Each paper has its own page. Design looks intentional — minimal/academic, desktop-first. Lighthouse ≥90.

| ID | Task | Effort | Dep | Agent |
|---|---|---|---|---|
| A7-T1 | Write A7 PRD + plan | S | — | planner |
| A7-T2 | Write `PaperDetail` component (full abstract, all metadata, PDF link, code link, save + read toggle) | L | — | — |
| A7-T3 | Write `/papers/[id]` page route | S | A7-T2 | — |
| A7-T4 | Design token system (`styles/tokens.css`) — minimal academic palette, desktop-first layout vars | M | — | — |
| A7-T5 | Typography system (`styles/typography.css`) — scale, line-height, reading width | M | A7-T4 | — |
| A7-T6 | Redesign `PaperCard` with token-based spacing, hierarchy, hover states | M | A7-T4 | — |
| A7-T7 | Redesign `FilterSidebar` with proper visual structure | M | A7-T4 | — |
| A7-T8 | Layout pass: sidebar + content two-column layout at 1024px+ | M | A7-T4 | — |
| A7-T9 | Mobile layout pass (390px — single column, filter sheet) | M | A7-T8 | — |
| A7-T10 | Lighthouse audit on feed page + paper detail page | S | A7-T9 | performance-optimizer |
| A7-T11 | Fix Lighthouse issues until ≥90 Performance + Accessibility | M | A7-T10 | — |
| A7-T12 | a11y sweep (keyboard nav, focus states, contrast, ARIA) | M | A7-T11 | a11y-architect |
| A7-T13 | Anti-template check: does it look like a real research tool? | S | A7-T12 | — |
| A7-T14 | Code review | S | A7-T13 | code-reviewer + typescript-reviewer |

**Done when:** Paper detail page live. Feed looks like a real tool (not a default card grid). Lighthouse ≥90. a11y clean.

---

### A8 — Production Deploy

**Deliverable:** Site accessible over internet. Ingestion running automatically. Secrets in env. CSP headers set.

| ID | Task | Effort | Dep | Agent |
|---|---|---|---|---|
| A8-T1 | Write A8 PRD + plan | S | — | planner |
| A8-T2 | Security audit (auth, API routes, scrapers, env vars) | M | — | security-reviewer |
| A8-T3 | Fix all CRITICAL + HIGH security issues from A8-T2 | M | A8-T2 | — |
| A8-T4 | Production security headers in `next.config.ts` (CSP, HSTS, X-Frame-Options, etc.) | M | — | — |
| A8-T5 | Final env var Zod validation in `env.ts` (fail fast on missing vars) | S | — | — |
| A8-T6 | Create Supabase production project + run migrations | M | — | — |
| A8-T7 | Deploy to Vercel (connect repo, set env vars, configure Inngest webhook URL) | M | A8-T6 | — |
| A8-T8 | Trigger manual seed ingest on production; verify papers appear | S | A8-T7 | — |
| A8-T9 | Verify Inngest scheduled jobs running (arXiv daily, conferences weekly) | S | A8-T8 | — |
| A8-T10 | Audit `.env.example` — all keys present, values empty | S | — | — |
| A8-T11 | Code review | S | A8-T10 | code-reviewer + security-reviewer |

**Done when:** Site loads on my phone via HTTPS. Ingestion runs without manual trigger for 2 days. No secrets in source code.

---

### A9 — E2E Coverage + Polish

**Deliverable:** E2E green on Chrome/Firefox/Safari. a11y clean. Error + empty states handled.

| ID | Task | Effort | Dep | Agent |
|---|---|---|---|---|
| A9-T1 | Write A9 PRD + plan | S | — | planner |
| A9-T2 | Playwright E2E: feed load + pagination | M | — | e2e-runner |
| A9-T3 | Playwright E2E: filter interactions (open, select, clear, URL persistence) | M | — | e2e-runner |
| A9-T4 | Playwright E2E: search (type query, see results, clear) | M | — | e2e-runner |
| A9-T5 | Playwright E2E: paper detail page (open, PDF link, save, read status) | M | — | e2e-runner |
| A9-T6 | Playwright E2E: saved papers page | S | — | e2e-runner |
| A9-T7 | Viewport tests: 390, 768, 1024, 1440px screenshots for all key views | M | A9-T2 | e2e-runner |
| A9-T8 | Cross-browser: run E2E suite on Chrome + Firefox + Safari | M | A9-T7 | e2e-runner |
| A9-T9 | Empty state: no papers found (first run, or filter returns zero) | S | — | — |
| A9-T10 | Error state: adapter failure (one source down, others still show) | M | — | — |
| A9-T11 | Error state: DB connection failure (graceful error page) | S | — | — |
| A9-T12 | Final a11y sweep across all pages | M | — | a11y-architect |
| A9-T13 | Fix all E2E failures + a11y issues | M | A9-T12 | — |
| A9-T14 | Code review + final quality gate check | S | A9-T13 | code-reviewer |

**Done when:** E2E suite green on Chrome/Firefox/Safari. All viewports pass. Error/empty states handled. a11y clean.

---

## Phase A Exit Criteria

Phase A is complete when all of these are true for at least 7 consecutive days:
- [ ] Site accessible at production URL
- [ ] New arXiv papers appear automatically every morning
- [ ] Conference papers appear automatically every week
- [ ] No ingestion babysitting required
- [ ] Can filter by topic, venue, year in under 50ms
- [ ] Can search and find a paper by keyword
- [ ] Saved papers persist across sessions

---

## Phase B — Enhancements (outline)

| Sub-phase | Deliverable | Notes |
|---|---|---|
| B1 | AI one-line summaries (Claude Haiku, cost-capped) | ~$0.02/day; see `cost-aware-llm-pipeline` skill |
| B2 | Weekly email digest — new papers matching saved keywords | Resend; add `RESEND_API_KEY` |
| B3 | Related papers panel (Semantic Scholar recommendations API) | Per-paper sidebar widget |
| B4 | Author tracking — follow specific researchers | New `followed_authors` table |
| B5 | Dataset mentions extraction (which benchmarks a paper uses) | NLP over abstract at ingest time |
| B6 | BibTeX / CSV export · PWA offline reading list | Needs service worker |

---

## Current Status

| Sub-phase | Status |
|---|---|
| A0 | ✅ Done (2026-04-21) — PRD, V4 schema, adapter types, scorer+tagger (21/21 tests green), skills, env schema landed. Schema pushed to Supabase via `bin/apply-migration.mjs`. Dev server verified at :3000 with empty-state render. Pending manual: A0-T9 hook smoke test (user-only). |
| A1 | ✅ Done (2026-04-25) — Code, schema reconciliation, end-to-end smoke, code-reviewer + typescript-reviewer, viewport tests (13/13 chromium), a11y sweep all complete. All 6 HIGH code-review findings fixed; all 3 a11y HIGH (text-muted contrast, accent-on-soft, score chip) fixed via `--color-accent-strong` token + text-muted darkening; MEDIUMs M2/M3/M4 cleaned (dropped duplicate venue, sr-only relevance label, removed aria-labelledby from non-interactive div, added "opens in new tab" sr-only). 34/34 unit tests green; typecheck/lint clean. Pending: git init + conventional commit (no repo yet). |
| A2 | 🔲 Not started |
| A3 | 🔲 Not started |
| A4 | 🔲 Not started |
| A5 | 🔲 Not started |
| A6 | 🔲 Not started |
| A7 | 🔲 Not started |
| A8 | 🔲 Not started |
| A9 | 🔲 Not started |

---

*Last updated: 2026-04-26 | Current phase: A2 closed pending real-API smoke + commit | Next action: SEMANTIC_SCHOLAR_API_KEY in .env.local → smoke HF + S2 manual triggers → `git init` (no repo yet) + conventional commit covering A1+A2 → open A3 (CVF + OpenReview adapters).*

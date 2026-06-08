# A7 — Paper detail page + design pass

**Status:** Draft
**Date:** 2026-05-17
**Owner:** tusharpatel
**Builds on:** A6 (save + read-status tracking; `/saved` view shipped)

## Goal

Two things, shipped together:

1. **A real paper detail page at `/papers/[id]`** — clicking a paper title goes to a dedicated page with the full abstract, all tags, all metadata, save/read toggles, and a primary "Open PDF" CTA. Today the title links straight to the external PDF; A7 introduces an internal stop so a paper has a stable URL inside ForensicFeed.

2. **A design pass that makes the surface look like a research tool, not a default card grid.** Editorial direction: serif headings, mono meta, real typographic hierarchy, refined focus rings, deliberate spacing rhythm. Passes the anti-template check in `~/.claude/rules/web/design-quality.md`.

**Success shape:**

1. Click a paper title in the feed → land on `/papers/[id]` with full abstract and all metadata visible above the fold on a 1440px viewport.
2. Save/read toggles on the detail page mutate the same backend state as the feed; reload preserves it.
3. A 1024px screenshot of `/` reads like a research tool — title hierarchy is obvious at a glance, meta line uses mono, accent colour reserved for action/state not decoration.
4. Lighthouse Performance ≥90 on the detail page when run against a local prod build.

## Scope

### In scope — paper detail page

- **Route:** `src/app/papers/[id]/page.tsx`. Server component. `runtime = 'nodejs'`, `dynamic = 'force-dynamic'` (matches `/` and `/saved`).
- **Query:** `getPaperById(id)` in `src/lib/db/queries/papers.ts`. LEFT JOINs `user_saves` and `read_status` exactly like `listRecentPapers` so the return is `PaperWithUserState | null`. Returns null on miss; route calls `notFound()` (Next.js built-in 404 page).
- **Layout (desktop-first, 1024px+):**
  - Back link top-left ("← Back to feed" or "← Back to saved" — falls back to "Back to feed" if no referrer signal).
  - Hero block: `publishedDate · venue · relevance` line in mono, paper title in serif at `--text-hero`, authors below in `--text-sm`.
  - Action row: primary `<a>` button "Open PDF" (or "Open on arXiv" if no PDF URL), secondary `Save` + `Mark as read` toggles, optional "View code" link if `codeUrl` present.
  - Abstract block: full untruncated abstract in a readable measure (max-width ~70ch).
  - Metadata strip below abstract: all relevance tags (no slicing to 4), citation count, source, year, DOI/arXiv ID with copy-friendly mono formatting.
- **Not-found:** Next.js `notFound()` → standard 404. No custom 404 page in A7.
- **Title link in feed:** `PaperCard` title currently `target="_blank"` to the PDF. Change to internal `<Link href={\`/papers/${id}\`}>`. PDF stays accessible via the existing "tag-badge-code" pattern in the footer (rename/relabel to "PDF" — code link stays separate).

### In scope — design pass

- **`tokens.css` refinements:**
  - Add `--text-meta: var(--text-xs)`, `--font-meta: var(--font-mono)` for the mono meta line.
  - Add `--leading-tight: 1.2`, `--leading-normal: 1.5`, `--leading-relaxed: 1.65` so abstract paragraphs breathe.
  - Add `--focus-ring: 0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-accent)` and apply consistently to all interactive elements.
  - Add `--measure: 70ch` for prose blocks.
- **Typography:**
  - Paper titles use `--font-serif` at card scale and hero scale on the detail page.
  - Meta lines (date · score · citations) use `--font-mono` at `--text-xs` with `letter-spacing: 0.02em` and `text-transform: lowercase` — earns the editorial feel without being cute.
  - Body/abstract uses `--font-sans` at `--text-base` with `--leading-relaxed`.
- **PaperCard refactor:**
  - Title: serif, real weight (600), tighter leading.
  - Meta: mono treatment as above.
  - Hover: subtle elevation via `transform: translateY(-1px)` + border colour shift (no shadow inflation; compositor-friendly only).
  - Accent colour reserved for: the relevance pill, save (when active), the "Open PDF" button. No decorative accents.
- **Feed header → masthead:** "Latest papers" gets a small uppercase eyebrow ("the feed" in mono caps) above it, a tightened subtitle below, and a thin horizontal rule under the whole block. Same treatment on `/saved`.
- **Detail-page styling:** new `src/components/paper-detail/paper-detail.css`. Tokens-only; no inline values.
- **Anti-template self-check** (run before commit):
  - [ ] Title hierarchy obvious without colour
  - [ ] Meta uses mono — not just bold gray
  - [ ] At least one of: editorial eyebrow, serif headings, deliberate horizontal rule
  - [ ] Hover/focus states feel designed, not default
  - [ ] No uniform-card-grid look — meta + title + abstract have visual rhythm

### Out of scope (deferred)

- Mobile polish below 768px — desktop-first per CLAUDE.md, defer to A9.
- E2E spec for `/papers/[id]` — needs live DB, defer to A9 alongside the rest of the E2E pass.
- Lighthouse CI integration — defer to A8 (deploy phase).
- "More like this" / related papers — Phase B (B3).
- Paper detail loading skeleton — server-rendered, no client-side fetch state to skeleton.
- Custom 404 page — Next.js default is fine for A7.
- BibTeX/citation export buttons — B6.
- Dark mode — not in Phase A.
- AI summary on detail page — B1.
- View transitions between feed and detail — defer; complicates Phase A test surface.

## Decisions locked

1. **Title goes to detail page, not external PDF.** External-PDF-on-title is a research-paper-aggregator default that prevents the product from owning the URL. A real tool has its own surface for each paper.
2. **Editorial direction over neo-brutal / glassmorphism / bento.** Research papers carry implicit "journal" associations; serif + mono is the most legible cue that this is for reading, not browsing.
3. **No new design tokens beyond what supports this pass.** Tokens added must each have a caller in A7. Avoid speculative tokens.
4. **`notFound()` not a redirect on missing paper.** Hitting `/papers/badid` should be a clear 404, not a silent redirect to `/`.
5. **Action row uses an `<a>` for the PDF (not a `<button>` with `window.open`).** Semantic anchor with `target="_blank" rel="noopener noreferrer"`. Right-click / cmd-click / "copy link" all work.

## Quality gates (must all pass before commit)

- [ ] `npx tsc --noEmit` clean
- [ ] All vitest tests green (target ~235+ — adds ~5 tests for getPaperById + detail page)
- [ ] `npx next build` succeeds, `/papers/[id]` first-load under 150 kB
- [ ] Manual anti-template check above ticked
- [ ] No file >800 lines, no function >50 lines
- [ ] Save/read toggles on detail page hit the same APIs as feed (no duplicated mutation logic)

## File map

**New:**

- `src/app/papers/[id]/page.tsx`
- `src/components/paper-detail/PaperDetail.tsx`
- `src/components/paper-detail/paper-detail.css`
- `tests/unit/get-paper-by-id.test.ts`
- `tests/unit/paper-detail.test.tsx` (light — render shape only, no DB)

**Modified:**

- `src/lib/db/queries/papers.ts` — add `getPaperById`
- `src/styles/tokens.css` — add typography + focus-ring tokens
- `src/components/feed/PaperCard.tsx` — title now `<Link>` to `/papers/[id]`; mono meta; serif title
- `src/components/feed/feed.css` — refined hover, masthead treatment
- `src/components/paper-actions/paper-actions.css` — share focus-ring token
- `app/README.md` — A7 row added to status block
- `README.md` (root) — A7 marked shipped after commit

## Why this scope (not more)

A7 is the design pass + the missing structural piece (detail page). I considered adding view transitions, a related-papers panel, and BibTeX export. All three are real value but each one is its own surface — they belong in B-phase or A9. Shipping a tight A7 that nails _typography and a stable per-paper URL_ is the highest-leverage move because every subsequent feature (summaries, related papers, notes) hangs off the detail page.

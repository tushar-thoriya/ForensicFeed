# A7 — Implementation plan

**Prereq:** A6 shipped. `PaperWithUserState`, `SaveButton`, `ReadToggle`, `/saved` route all live.
**Sequence:** strictly top-to-bottom. Don't skip ahead — typography refactor wants the detail page to test against.

## Phase 1 — Data layer

1. Add `getPaperById(id: string): Promise<PaperWithUserState | null>` to `src/lib/db/queries/papers.ts`.
   - Same SELECT shape as `listRecentPapers` minus the headline column (no search context on detail page).
   - LEFT JOIN `user_saves` + `read_status`, project `isSaved` / `isRead` as booleans.
   - `WHERE papers.id = ${id} LIMIT 1`.
   - Return `null` when no row.
2. Write `tests/unit/get-paper-by-id.test.ts`:
   - Mock the drizzle client; verify SQL shape contains `papers.id =` predicate and the LEFT JOINs.
   - Round-trip: stub a row, assert `isSaved`/`isRead` mapped to booleans.
   - Returns null when stub returns empty array.

## Phase 2 — Detail route

3. Create `src/app/papers/[id]/page.tsx`:
   - `export const runtime = 'nodejs'`, `export const dynamic = 'force-dynamic'`.
   - `Props = { params: Promise<{ id: string }> }` (Next 15 async params).
   - Await params, call `getPaperById`. If null → `notFound()`.
   - Render `<PaperDetail paper={paper} />`.
4. Create `src/components/paper-detail/PaperDetail.tsx`:
   - Layout in PRD: back link, meta line, serif title, authors, action row, abstract, metadata strip.
   - Reuse `<SaveButton>` and `<ReadToggle>` for save/read toggles.
   - "Open PDF" button: real `<a>`, primary visual treatment.
   - "View code" link only when `codeUrl` truthy.
   - Format authors fully (no slicing to 3 — detail page should show all).
   - DOI/arxivId in mono pill at bottom of metadata strip.
5. Create `src/components/paper-detail/paper-detail.css`:
   - Tokens only; structure follows PaperCard.css naming conventions.

## Phase 3 — Design pass

6. Edit `src/styles/tokens.css`:
   - Add `--leading-tight`, `--leading-normal`, `--leading-relaxed`.
   - Add `--text-meta`, `--measure`, `--focus-ring`.
   - No removals — append-only this round.
7. Edit `src/components/feed/PaperCard.tsx`:
   - Title becomes `<Link href={\`/papers/${paper.id}\`}>`. Drop external PDF on title.
   - Add a separate "PDF" link in the footer alongside the code link (same `.tag-badge-code` styling pattern but distinct label).
   - Meta line gets a new class `paper-card-meta-mono` for the typography treatment.
8. Edit `src/components/feed/feed.css`:
   - Title: `font-family: var(--font-serif)`, `font-weight: 600`, `line-height: var(--leading-tight)`.
   - Meta: mono + uppercase + letter-spacing.
   - Card hover: `transform: translateY(-1px)` + border colour shift. Compositor-only.
   - Masthead: eyebrow ("the feed" / "saved"), tightened subtitle, thin `<hr>` under header block.
9. Edit `src/app/page.tsx` and `src/app/saved/page.tsx`:
   - Add the eyebrow div above `<h1>`. Add `<hr className="feed-header-rule" />` after the meta line.

## Phase 4 — Quality gates

10. `npx tsc --noEmit` clean.
11. `pnpm test` — all green. New tests cover getPaperById + a light PaperDetail render test.
12. `npx next build` — succeeds. Note `/papers/[id]` first-load size; flag if >150 kB.
13. Anti-template check from PRD §"Anti-template self-check".
14. Manual eyeball: `/`, `/saved`, `/papers/<some-real-id>` (if a row exists) — confirm masthead/title/meta read editorial.

## Phase 5 — Commit + memory

15. Single commit: `feat(detail): add paper detail page + editorial design pass`.
    - Body lists: new route, `getPaperById`, token additions, typography refactor, anti-template check completed.
16. Write `memory/a7-progress.md`. Demote `a6-progress.md` in MEMORY.md.
17. Update `app/README.md` Status row + capability table. Update root `README.md` roadmap row to ✅.

## Risks / mitigations

- **Risk:** Internal `<Link>` on title regresses "open in new tab" muscle memory. **Mitigation:** keep cmd-click — Next.js `<Link>` supports it natively. PDF stays one click away via the footer "PDF" link.
- **Risk:** Serif title breaks if `Source Serif Pro` not loaded. **Mitigation:** existing `--font-serif` fallback chain already includes Georgia / Times New Roman.
- **Risk:** Typography refactor breaks existing PaperCard tests by changing the DOM. **Mitigation:** Tests assert behavior (text content, aria) not class names — should pass unchanged. Re-run all to confirm.
- **Risk:** `getPaperById` SQL-shape test brittle on drizzle internals. **Mitigation:** use the same `PgDialect` toSQL approach as the existing `list-papers` test.

## Done when

- Clicking any paper title on `/` opens `/papers/<id>` and shows the full record.
- A 1024px screenshot of `/` looks like a research tool, not a generic card grid.
- All quality gates ticked, commit landed on main, memory updated.

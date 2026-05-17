# A6 — Implementation plan

**Date:** 2026-05-17
**PRD:** `app/docs/A6-PRD.md`
**Approach:** TDD inside-out, same as A5. DB query layer first (lets every consumer compile), then API routes, then components, then `/saved` route, then E2E. Each phase ends with `npx vitest run` (and `npx tsc --noEmit`) green before moving on.

## Build order

### Phase 1 — Types + query layer (TDD)

| Step | Task | File | Gate |
|---|---|---|---|
| 1.1 | Extend `paper.ts`: add `PaperWithUserState = PaperWithHighlight & { isSaved: boolean; isRead: boolean }` and export | `src/types/paper.ts` | Compiles |
| 1.2 | Write extended SQL-shape tests for `listRecentPapers`: LEFT JOIN on `user_saves` + `read_status`; selects `is_saved`/`is_read` (RED) | `tests/unit/list-papers.test.ts` (modify) | Tests fail |
| 1.3 | Extend `listRecentPapers`: `db.select({ ...existingCols, headline: ..., isSaved: sql\`...IS NOT NULL\`, isRead: sql\`...= 'read'\` })` with LEFT JOINs | `src/lib/db/queries/papers.ts` | Green; existing 207 still pass |
| 1.4 | Update every consumer to use `PaperWithUserState` (page.tsx, PaperList, PaperCard prop type) | (multiple) | Typecheck green |
| 1.5 | Write `listSavedPapers` SQL-shape tests (RED): INNER JOIN on user_saves; ORDER BY saved_at DESC when sortBy=null | `tests/unit/saved-papers-query.test.ts` (new) | Tests fail |
| 1.6 | Implement `listSavedPapers` | `src/lib/db/queries/saved-papers.ts` (new) | Green |
| 1.7 | Write mutation tests: `setSaved` upserts/deletes idempotently; `setReadStatus` upserts/deletes idempotently | `tests/unit/saves-mutations.test.ts` (new) | Use compiled SQL-shape via PgDialect (same pattern as list-papers tests) |
| 1.8 | Implement `setSaved` + `setReadStatus` | `src/lib/db/queries/saves.ts` (new) | Green |

### Phase 2 — API routes (TDD)

| Step | Task | File | Gate |
|---|---|---|---|
| 2.1 | Write API tests using Next.js `Request` mock: 200 on valid body, 400 on bad body, idempotent on repeat (RED) | `tests/unit/saves-api.test.ts` (new) | Tests fail |
| 2.2 | Implement `POST /api/saves` — Zod schema `{ paperId: z.string().min(1), saved: z.boolean() }`, call `setSaved`, return `{ ok: true }` | `src/app/api/saves/route.ts` (new) | Green |
| 2.3 | Implement `POST /api/read-status` — Zod schema `{ paperId: z.string().min(1), status: z.enum(['read','unread']) }`, call `setReadStatus`, return `{ ok: true }` | `src/app/api/read-status/route.ts` (new) | Green |

### Phase 3 — UI components (TDD)

| Step | Task | File | Gate |
|---|---|---|---|
| 3.1 | Write `SaveButton` tests: renders unsaved icon when `initialSaved=false`; aria-pressed flips on click; calls fetch with `{paperId, saved: true}` (RED) | `tests/unit/save-button.test.tsx` (new) | Tests fail |
| 3.2 | Implement `SaveButton` | `src/components/paper-actions/SaveButton.tsx` (new) | Green |
| 3.3 | Write `ReadToggle` tests: aria-checked flips; correct API body (RED) | `tests/unit/read-toggle.test.tsx` (new) | Tests fail |
| 3.4 | Implement `ReadToggle` | `src/components/paper-actions/ReadToggle.tsx` (new) | Green |
| 3.5 | Add `paper-actions.css` — actions row layout, focus rings, 44×44 touch targets | `src/components/paper-actions/paper-actions.css` (new) | Visible in dev |
| 3.6 | Extend `PaperCard` — render `<SaveButton>` + `<ReadToggle>` in `paper-card-actions`; apply `.paper-card-read` when `isRead` | `src/components/feed/PaperCard.tsx` (modify) | Renders both controls; clicking save/read doesn't open PDF (stopPropagation) |
| 3.7 | Add `.paper-card-read` dim styles + `--read-opacity` / `--read-saturate` tokens | `src/components/feed/feed.css` + `src/styles/tokens.css` (modify) | Read cards visually dim |

### Phase 4 — `/saved` route + nav

| Step | Task | File | Gate |
|---|---|---|---|
| 4.1 | Create `FeedNav` component — two text links (Feed / Saved) with `aria-current="page"` for active route | `src/components/nav/FeedNav.tsx` (new) | Renders inline above page header |
| 4.2 | Render `<FeedNav>` in `src/app/page.tsx` above the existing page header | `src/app/page.tsx` (modify) | Visible at top of feed |
| 4.3 | Add `nothing-saved` variant to `EmptyState` ("Nothing saved yet. Tap the bookmark on any paper to keep it here.") | `src/components/feed/EmptyState.tsx` (modify) | Variant available |
| 4.4 | Create `/saved` page: same shape as `/`, calls `listSavedPapers`, picks `nothing-saved` empty state | `src/app/saved/page.tsx` (new) | Navigating to `/saved` works |
| 4.5 | Update result-count text on `/saved`: "Saved papers · {N} saved" | (in `/saved` page header) | Visible |

### Phase 5 — Quality gates

| Step | Task | Gate |
|---|---|---|
| 5.1 | `npx tsc --noEmit` | Clean |
| 5.2 | `npx vitest run` | All tests green; A6 unit tests added (~ 20+ new cases); no regressions |
| 5.3 | `npx next build` | Production build passes; first-load JS under 150 KB |
| 5.4 | Parallel reviewer sweep: code-reviewer + typescript-reviewer + database-reviewer + security-reviewer | No CRITICAL/HIGH open |
| 5.5 | Manual smoke (if DB live): save a paper, reload, see it persist; navigate to /saved, see it; toggle read, reload, still dim |  |
| 5.6 | E2E (best-effort): tests/e2e/saved.spec.ts runs against chromium | 2+ tests green; skip gracefully if DB unreachable |

### Phase 6 — Commit + checkpoint

| Step | Task |
|---|---|
| 6.1 | Conventional commit: `feat(saves): add save + read-status tracking and /saved view` |
| 6.2 | Update memory: write `a6-progress.md`, demote `a5-progress.md`, refresh `MEMORY.md` |

## File estimate

| File | Type | Est. lines |
|---|---|---|
| `src/types/paper.ts` | modify | +5 |
| `src/lib/db/queries/papers.ts` | modify | +20 |
| `src/lib/db/queries/saved-papers.ts` | new | ~50 |
| `src/lib/db/queries/saves.ts` | new | ~50 |
| `src/app/api/saves/route.ts` | new | ~35 |
| `src/app/api/read-status/route.ts` | new | ~35 |
| `src/components/paper-actions/SaveButton.tsx` | new | ~80 |
| `src/components/paper-actions/ReadToggle.tsx` | new | ~60 |
| `src/components/paper-actions/paper-actions.css` | new | ~60 |
| `src/components/feed/PaperCard.tsx` | modify | +20 |
| `src/components/feed/feed.css` | modify | +15 |
| `src/styles/tokens.css` | modify | +3 |
| `src/components/nav/FeedNav.tsx` | new | ~40 |
| `src/components/feed/EmptyState.tsx` | modify | +10 |
| `src/app/page.tsx` | modify | +5 |
| `src/app/saved/page.tsx` | new | ~80 |
| `tests/unit/list-papers.test.ts` | modify | +30 |
| `tests/unit/saved-papers-query.test.ts` | new | ~60 |
| `tests/unit/saves-mutations.test.ts` | new | ~50 |
| `tests/unit/saves-api.test.ts` | new | ~70 |
| `tests/unit/save-button.test.tsx` | new | ~60 |
| `tests/unit/read-toggle.test.tsx` | new | ~60 |
| `tests/e2e/saved.spec.ts` | new | ~50 |

Heaviest new file: `SaveButton.tsx` at ~80 lines. No file approaches the 800-line cap.

## Risk gates

- **LEFT JOIN return type stability** — A5 already taught us `db.select({...})` must use an explicit column list so the return type is stable. Same pattern here. The new `isSaved`/`isRead` columns are typed via `sql<boolean>\`...\`` and must be tested.
- **`router.refresh()` after mutation** — re-runs the server component. Cheap for now; if `/saved` page is slow with many saves, consider per-row mutation without refresh.
- **stopPropagation on action clicks** — `PaperCard` has clickable title link. SaveButton/ReadToggle handlers must `e.stopPropagation()` so a save-click doesn't also open the PDF in a new tab.
- **Hydration mismatch** — `SaveButton`/`ReadToggle` are client components rendered inside a server-component card. Their initial state comes from the server-rendered `isSaved`/`isRead` props. Avoid divergence: never read local storage or compute current-time state at mount.
- **Optimistic revert** — on fetch failure, the component must restore the prior visual state. Cover with a unit test that mocks fetch to reject.
- **Idempotent API design** — `setSaved(paperId, false)` when no row exists must NOT throw. `setReadStatus(paperId, 'unread')` when no row exists must NOT throw. Use Drizzle's `.where()` + delete, not `.delete().returning().expectOne()`.
- **Concurrent toggle** — rapid double-click: two POSTs in-flight. API is idempotent so server state is correct, but optimistic local state could land out-of-sync with the second response. Mitigation: disable the button while `isPending`. Add a unit test.
- **Read-status enum mismatch** — DB enum has 4 values, A6 only uses 2. The `isRead = (status = 'read')` projection means `reading`/`archived` rows count as NOT read. Documented in PRD.
- **CSRF in Phase A** — accepted, no auth surface. Add CSRF tokens with auth in Phase B.
- **`/saved` with INNER JOIN + no saves** — INNER JOIN naturally returns zero rows, triggering `nothing-saved` empty state. Verified by query test.

## Time estimate

~3–5 hours focused dev. The query layer (Phase 1) is most of the test surface; the API routes and components are mostly mechanical once the contracts compile.

## Definition of done

Mirrors `A6-PRD.md` "Done when". All boxes ticked before commit.

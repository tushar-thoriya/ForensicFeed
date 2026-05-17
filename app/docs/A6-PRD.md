# A6 — Save & read-status tracking; saved-papers view

**Status:** Draft
**Date:** 2026-05-17
**Owner:** tusharpatel
**Builds on:** A5 (full-text search shipped, committed `9386e44` + `0f1ab11`)

## Goal

Two new actions on every paper card: **Save** (bookmark for later) and **Read** (toggle done/not-done). Saved papers get their own route at `/saved`. Read papers stay in the main feed but visually dim so the eye skips past them on scan-through. State persists across reloads — no auth, single-user (matches Phase A spec).

**Success shape:**
1. Click the bookmark icon on a paper card → icon fills in → reload → still filled.
2. Open `/saved` → see only saved papers, in save order (most recent first).
3. Click the read checkbox on a paper card → card dims → still dim after reload → unchecking restores full opacity.
4. Filters and search on `/` still work; `/saved` reuses the same filter sidebar.

## Scope

### In scope

- **No schema migration** — `user_saves` and `read_status` tables already exist in `schema.ts` (with cascade deletes from `papers`). The `read_status_value` enum has four values (`unread`/`reading`/`read`/`archived`); A6 only uses `unread` and `read`. Other two stay reserved for future use, but A6 ignores them in UI logic.
- **`POST /api/saves`** — body `{ paperId, saved: boolean }`. `saved: true` upserts a row; `saved: false` deletes it. Returns `{ ok: true }`. Idempotent.
- **`POST /api/read-status`** — body `{ paperId, status: 'read' | 'unread' }`. `'read'` upserts a row with status='read'; `'unread'` deletes the row (absence = unread by default, avoids growing the table with no-op rows). Returns `{ ok: true }`. Idempotent.
- **`listRecentPapers` extension** — LEFT JOIN both tables and project `isSaved: boolean` and `isRead: boolean` onto every paper row. Existing call sites get the augmented type automatically; tests update.
- **`PaperWithUserState` type** — `PaperWithHighlight & { isSaved: boolean; isRead: boolean }`. Becomes the new return type of `listRecentPapers`. Renamed once; no parallel types.
- **`SaveButton.tsx`** — bookmark icon (SVG, filled/outlined), `'use client'`, optimistic toggle via `useTransition` + `router.refresh()`. Falls back to its server-rendered state on transition failure (catch + restore). `aria-pressed` for screen readers. `aria-label` toggles between "Save paper" / "Unsave paper".
- **`ReadToggle.tsx`** — checkbox with label "Read", `'use client'`, same optimistic pattern. `aria-checked`. Native `<input type="checkbox">` (better keyboard story, smaller bundle).
- **`PaperCard` extension** — accept `isSaved` + `isRead`; render `<SaveButton>` and `<ReadToggle>` in a new `paper-card-actions` row; apply `.paper-card-read` class when `isRead === true`.
- **CSS — read-dimming** — `.paper-card-read { opacity: 0.55; }` plus a slight desaturate via `filter: saturate(0.85)`. Hover restores to `opacity: 0.9` so the card is still clearly clickable. Tokens go through `--read-opacity` / `--read-saturate` so the dim level can be tuned later from `tokens.css`.
- **`/saved` route** — new server component at `src/app/saved/page.tsx`. Queries `listSavedPapers({ filters })` which is `listRecentPapers` constrained to saved papers (INNER JOIN `user_saves`). Reuses `<FilterPanel>`, `<SearchInput>`, `<PaperList>`. Page header changes to "Saved papers · N saved". Empty state: "Nothing saved yet. Tap the bookmark on any paper to keep it here."
- **Nav link** — small text-link in the page header switching between `Feed` and `Saved`. Reflects current route as active. No fancy nav component.
- **Order on `/saved`** — by `user_saves.saved_at DESC` by default; sort/filter UI from A4 still applies but the implicit default is save-recency, not paper publish date.
- **Unit tests** — API route handlers (idempotency, body validation), `listRecentPapers` join produces correct `isSaved`/`isRead`, `listSavedPapers` only returns saved rows.
- **Component tests** — `SaveButton` toggles `aria-pressed` and calls the API; `ReadToggle` toggles `aria-checked`; `PaperCard` applies `paper-card-read` class when `isRead`.
- **E2E (best-effort, deferred if no live DB)** — Playwright: save a paper, navigate to `/saved`, see it; toggle read, reload, still read.
- **a11y** — `SaveButton`: `aria-pressed`, focus ring, 44×44 touch target. `ReadToggle`: associated `<label>`, `aria-checked`. Nav link: current route gets `aria-current="page"`.

### Out of scope (later)

- Auth / multi-user — Phase B
- The `reading` / `archived` read-states — schema-ready but no UI in A6
- Reading-progress tracking (% scrolled, time spent) — not needed
- Save folders / tags — single flat saved list is fine
- Notes / annotations on saved papers — Phase B
- Saved-paper export (BibTeX, CSV) — B6
- Reordering saved papers manually — default save-recency is the only order
- Bulk operations (save all, mark all read) — single-user, low volume
- "Read later" separate from "Saved" — collapse into one Save action

## Existing state (post-A5, already in repo)

| Piece | File | Status |
|---|---|---|
| `user_saves` table | `src/lib/db/schema.ts:86-98` | ✅ exists, cascade-delete from `papers` |
| `read_status` table | `src/lib/db/schema.ts:100-113` | ✅ exists, cascade-delete from `papers` |
| `read_status_value` enum | `src/lib/db/schema.ts:31-36` | ✅ 4 values; A6 only uses `read`/`unread` |
| `listRecentPapers` | `src/lib/db/queries/papers.ts` | ✅ extend with LEFT JOINs |
| `PaperWithHighlight` | `src/types/paper.ts` | ✅ rename / extend to `PaperWithUserState` |
| `PaperCard` | `src/components/feed/PaperCard.tsx` | ✅ add actions row, accept new props |
| `FilterPanel`, `SearchInput`, `PaperList`, `EmptyState` | `src/components/...` | ✅ reuse on `/saved` |
| API route pattern | `src/app/api/health/route.ts` (template) | ✅ follow same shape |

## Deliverables

| # | File | Purpose |
|---|---|---|
| 1 | `src/types/paper.ts` (modified) | Rename `PaperWithHighlight` → `PaperWithUserState = PaperWithHighlight & { isSaved: boolean; isRead: boolean }`. (Keep `PaperWithHighlight` as the intermediate type for the SQL projection; export both.) |
| 2 | `src/lib/db/queries/papers.ts` (modified) | `listRecentPapers` adds LEFT JOIN on `user_saves` and `read_status`; returns `PaperWithUserState[]`. |
| 3 | `src/lib/db/queries/saved-papers.ts` (new) | `listSavedPapers({ filters })` — same shape as `listRecentPapers` but INNER JOIN on `user_saves`, ORDER BY `saved_at DESC` when no explicit sort. |
| 4 | `src/lib/db/queries/saves.ts` (new) | `setSaved(paperId, saved)` and `setReadStatus(paperId, isRead)` — pure DB mutations, returning `{ ok: true }`. Both idempotent. |
| 5 | `src/app/api/saves/route.ts` (new) | `POST` handler: Zod-validate body, call `setSaved`, return `{ ok: true }`. |
| 6 | `src/app/api/read-status/route.ts` (new) | `POST` handler: Zod-validate body, call `setReadStatus`, return `{ ok: true }`. |
| 7 | `src/components/paper-actions/SaveButton.tsx` (new) | Client component, optimistic toggle, `aria-pressed`. |
| 8 | `src/components/paper-actions/ReadToggle.tsx` (new) | Client component, optimistic toggle, `aria-checked`. |
| 9 | `src/components/paper-actions/paper-actions.css` (new) | Layout for the actions row, button styles, focus ring. |
| 10 | `src/components/feed/PaperCard.tsx` (modified) | Render actions row; apply `.paper-card-read` when `isRead`. |
| 11 | `src/components/feed/feed.css` (modified) | Add `.paper-card-read` dim styles + tokens (`--read-opacity`, `--read-saturate`). |
| 12 | `src/app/saved/page.tsx` (new) | Saved-papers view; reuses FilterPanel + SearchInput + PaperList. |
| 13 | `src/components/nav/FeedNav.tsx` (new) | Two-link nav (`Feed` / `Saved`) with `aria-current="page"`. |
| 14 | `src/app/page.tsx` + `src/app/saved/page.tsx` | Render `<FeedNav>` above the page header. |
| 15 | `src/app/saved/empty-state.tsx` or extend `EmptyState` | Add `nothing-saved` variant. |
| 16 | `tests/unit/saves-api.test.ts` (new) | API route handlers — happy path, bad input, idempotency. |
| 17 | `tests/unit/list-papers.test.ts` (modified) | Assert `isSaved`/`isRead` projected; LEFT JOIN present. |
| 18 | `tests/unit/saved-papers-query.test.ts` (new) | INNER JOIN on `user_saves`; order by `saved_at DESC` when no explicit sort. |
| 19 | `tests/unit/save-button.test.tsx` + `read-toggle.test.tsx` (new) | aria-pressed/aria-checked toggle; click calls fetch with right body. |
| 20 | `tests/e2e/saved.spec.ts` (new) | Best-effort: click save → navigate `/saved` → see paper. Skip gracefully if DB unreachable. |

## Contracts

### `PaperWithUserState`

```typescript
export type PaperWithUserState = PaperWithHighlight & {
  isSaved: boolean
  isRead: boolean
}
```

`listRecentPapers` returns `PaperWithUserState[]`. `isSaved` and `isRead` are always present (boolean, not optional). LEFT JOIN gives null for absent rows; the SQL projects `(user_saves.paper_id IS NOT NULL) AS is_saved` and `(read_status.status = 'read') AS is_read`.

### API routes

`POST /api/saves`
```typescript
// Body
{ paperId: string, saved: boolean }
// Response (200)
{ ok: true }
// Response (400) — bad body
{ ok: false, error: string }
```

`POST /api/read-status`
```typescript
// Body
{ paperId: string, status: 'read' | 'unread' }
// Response (200)
{ ok: true }
// Response (400)
{ ok: false, error: string }
```

Both are idempotent — calling `saved: true` twice or `status: 'read'` twice produces no error and no extra row.

### `listSavedPapers` signature

```typescript
export async function listSavedPapers(
  options: ListOptions = {}
): Promise<PaperWithUserState[]>
```

Reuses every filter A4/A5 added. The only structural difference vs `listRecentPapers`: INNER JOIN on `user_saves` and default ORDER BY `user_saves.saved_at DESC` when `sortBy === null`. Explicit sort (`'newest'`, `'relevance'`) overrides.

### `SaveButton` behaviour

- `'use client'` component.
- Props: `paperId: string`, `initialSaved: boolean`.
- Internal state: `optimistic` boolean (starts at `initialSaved`).
- Click handler: flip `optimistic`, call `fetch('/api/saves', { method: 'POST', body: JSON.stringify({ paperId, saved: optimistic }) })`. On error (response not ok, network throw): revert `optimistic` to previous and surface a small toast/alert (defer toast UI to A7 — for A6, console.error + revert is fine).
- After successful POST: call `router.refresh()` to re-fetch the server component so other consumers (e.g. `/saved` route count) see the new state on next nav.
- `aria-pressed={optimistic}`, `aria-label` reads "Save paper" when not saved, "Unsave paper" when saved.

### `ReadToggle` behaviour

- `'use client'` component.
- Props: `paperId: string`, `initialRead: boolean`.
- Same optimistic pattern as SaveButton.
- Renders a native `<input type="checkbox">` with `<label>` "Read"; checkbox handles keyboard a11y for free.
- On change: POST to `/api/read-status` with `status: 'read' | 'unread'`. Revert on failure.

### `/saved` route

- Server component, identical layout to `/`.
- Query: `listSavedPapers({ filters: parseFilterParams(searchParams) })`.
- Page header: "Saved papers · {N} saved" (replaces "Recent papers · {N} papers").
- Empty state: `nothing-saved` — "Nothing saved yet. Tap the bookmark on any paper to keep it here." + link back to `/`.
- Filters and search compose normally; URL keeps `?q=`, `?tag=`, etc.

## Done when

- [ ] `POST /api/saves` and `POST /api/read-status` work; idempotent; Zod-validated.
- [ ] `listRecentPapers` projects `isSaved` and `isRead` on every row.
- [ ] `SaveButton` toggles optimistically; reverts on failure.
- [ ] `ReadToggle` toggles optimistically; reverts on failure.
- [ ] Read papers visually dim on the feed; not hidden.
- [ ] `/saved` route shows saved papers in `saved_at DESC` order; filters compose.
- [ ] Nav link in page header switches between `Feed` and `Saved`; current route marked `aria-current="page"`.
- [ ] Empty states correct: `nothing-saved` on `/saved` with no saves; `no-matches`/`no-search-matches` still work when filters/search active.
- [ ] All 207+ unit tests still pass; new tests added (≥ 15 cases across API + queries + components).
- [ ] `pnpm typecheck`, `pnpm vitest run`, `npx next build` all pass.
- [ ] `code-reviewer` + `typescript-reviewer` + `database-reviewer` + `security-reviewer` sweep — no CRITICAL/HIGH open.
- [ ] No file > 800 lines; no function > 50 lines.

## Risk notes

- **Race on rapid double-clicks** — user clicks save twice fast: two POSTs, optimistic state toggles twice (saved → unsaved → saved). API is idempotent so final DB state is correct, but visual flicker possible. Mitigation: disable button while `isPending`. Document if not fixed in A6.
- **Read state on save click** — clicking save does NOT change read state. They're independent. Test this.
- **`router.refresh()` cost** — re-renders the whole server component subtree. Cheap with current page size; if perf degrades, revisit per-card mutation patterns.
- **Single-user assumption** — `user_saves.paper_id` is the primary key. If multi-user is added later (Phase B), this becomes `(user_id, paper_id)` and the migration is non-trivial. Note in code that the table currently assumes single-user.
- **`/saved` with active search** — `searchQuery` composes with INNER JOIN on saves. Means: search applies only within saved papers. Expected behaviour, but document.
- **CSRF** — `POST` to `/api/saves` and `/api/read-status` is state-changing. Single-user phase, same-origin only, but Next.js doesn't auto-CSRF-protect API routes. For Phase A this is acceptable (no auth surface to forge against); add CSRF tokens in Phase B alongside auth.
- **`isRead` derived from enum** — server projects `is_read = (read_status.status = 'read')`. Means rows with status `reading`/`archived` count as NOT read in A6. Documented; matches binary-toggle scope.
- **Click vs link bubble** — `SaveButton`/`ReadToggle` live inside `PaperCard` which has clickable title link. Click handlers must `stopPropagation` so clicking save doesn't also open the PDF.

## Non-goals / explicit deferrals

- Multi-user / auth (Phase B)
- Reading progress, time-on-page tracking (not needed)
- Per-state read-status UI (`reading`, `archived`) — schema-ready but no UI yet
- Save folders, tags, notes — single flat list
- Toast UI for failed mutations — console.error + revert for A6; toast lands in A7
- Saved-paper export — B6

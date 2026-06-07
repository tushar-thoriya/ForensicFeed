# Plan: A9 Phase 1 — Browser Matrix + E2E Smoke Coverage

## Summary
Trim the Playwright project matrix to Chrome + desktop Safari + mobile Safari (drop Firefox, Pixel 5, and the redundant 320px Chrome project), then add smoke E2E coverage for the two currently-uncovered critical flows: opening a paper detail page, and toggling save + read status. Save/read assertions run on the **detail page** (a single instance of each control) to avoid ambiguous multi-card locators on the feed.

## User Story
As the single user of ForensicFeed, I want one local `pnpm e2e` run on Chrome + Safari + mobile Safari to confirm the feed, filters, search, paper-detail, and save/read flows all work, so that I can push changes without silently breaking the tool.

## Problem → Solution
Today the E2E suite runs on 6 projects (incl. low-value Firefox/Pixel) and never exercises paper-detail navigation or the save/read toggles → A focused 3-project matrix with deterministic smoke tests for every critical path.

## Metadata
- **Complexity**: Small (2 files: 1 config edit, 1 new spec)
- **Source PRD**: `app/docs/A9-PRD.md`
- **PRD Phase**: Phase 1 — Browser matrix + E2E smoke
- **Estimated Files**: 2

---

## UX Design

Internal change — no user-facing UX transformation. This phase adds tests and trims test config only; it ships no product code.

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| `pnpm e2e` | 6 browser projects, no detail/save tests | 3 projects (Chrome, desktop Safari, mobile Safari), full critical-path smoke | Faster, focused, covers the gaps |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `playwright.config.ts` | all | The `projects[]` array to edit |
| P0 | `tests/e2e/home.spec.ts` | all | Empty-DB tolerance pattern + viewport handling to mirror |
| P0 | `tests/e2e/search.spec.ts` | all | `waitForURL` + role-locator + deterministic-wait conventions |
| P1 | `src/components/feed/PaperCard.tsx` | 60-110 | Title link selector + save/read placement |
| P1 | `src/components/paper-detail/PaperDetail.tsx` | 55-110 | Detail page accessible structure (h1, back link, actions) |
| P1 | `src/components/paper-actions/SaveButton.tsx` | all | Save button role/aria-label/aria-pressed for assertions |
| P1 | `src/components/paper-actions/ReadToggle.tsx` | all | Read checkbox role + label text for assertions |

## External Documentation

No external research needed — feature uses established internal Playwright patterns already present in `tests/e2e/`.

---

## Patterns to Mirror

### TEST_IMPORTS_AND_SHAPE
```ts
// SOURCE: tests/e2e/search.spec.ts:1-6
import { expect, test } from '@playwright/test'

test.describe('full-text search', () => {
  test.use({ viewport: { width: 1280, height: 900 } })
  test('typing updates URL with q param after debounce', async ({ page }) => {
    await page.goto('/')
    // ...
  })
})
```

### ROLE_LOCATORS_AND_DETERMINISTIC_WAITS
```ts
// SOURCE: tests/e2e/search.spec.ts:8-15
const input = page.getByRole('searchbox', { name: /search papers/i })
await expect(input).toBeVisible()
await input.fill('forgery')
// 300ms debounce + nav latency — wait for URL change rather than fixed sleep
await page.waitForURL(/[?&]q=forgery/, { timeout: 2000 })
```

### EMPTY_DB_TOLERANCE (critical — DB may have zero papers)
```ts
// SOURCE: tests/e2e/home.spec.ts:34-44
const cards = page.locator('.paper-card')
const empty = page.locator('.empty-state')
const cardCount = await cards.count()
const emptyCount = await empty.count()
expect(cardCount + emptyCount).toBeGreaterThan(0)
```

### PAPER_CARD_TITLE_LINK (entry to detail)
```tsx
// SOURCE: src/components/feed/PaperCard.tsx:77-83
const detailHref = `/papers/${encodeURIComponent(paper.id)}`
<h2 className="paper-card-title" id={titleId}>
  <Link className="paper-card-title-link" href={detailHref}>
    {paper.title}
  </Link>
</h2>
```

### DETAIL_PAGE_STRUCTURE (assertion targets)
```tsx
// SOURCE: src/components/paper-detail/PaperDetail.tsx:58-76
<div className="paper-detail-back">
  <Link href="/" className="paper-detail-back-link">← Back to feed</Link>
</div>
<h1 className="paper-detail-title">{paper.title}</h1>
// actions block contains exactly one <SaveButton/> and one <ReadToggle/>
```

### SAVE_BUTTON_A11Y (assertion contract)
```tsx
// SOURCE: src/components/paper-actions/SaveButton.tsx:74-80
<button
  aria-pressed={saved}                              // "true" | "false"
  aria-label={saved ? 'Unsave paper' : 'Save paper'} // accessible name
>
  <span className="paper-action-label">{saved ? 'Saved' : 'Save'}</span>
</button>
```

### READ_TOGGLE_A11Y (assertion contract)
```tsx
// SOURCE: src/components/paper-actions/ReadToggle.tsx:69-79
<label className="paper-action read-toggle">
  <input type="checkbox" className="read-toggle-input" checked={read} />
  <span className="paper-action-label">{read ? 'Read' : 'Mark read'}</span>
</label>
// role="checkbox"; assert via expect(cb).toBeChecked() / not.toBeChecked()
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `playwright.config.ts` | UPDATE | Trim `projects[]` to chromium + webkit + iPhone 12; drop firefox, Pixel 5, viewport-320 |
| `tests/e2e/paper-detail.spec.ts` | CREATE | Smoke: navigate feed→detail, render, save toggle, read toggle (single-instance on detail page) |

## NOT Building

- Firefox / Pixel coverage — locked out of scope (Chrome + Safari + mobile Safari only).
- A separate `save-read.spec.ts` — consolidated into `paper-detail.spec.ts` because the detail page has exactly one SaveButton/ReadToggle, eliminating multi-card locator ambiguity.
- Error/404 screens — that is PRD Phase 2 (separate plan).
- axe / keyboard a11y — that is PRD Phase 3 (separate plan).
- Seeding test data — tests tolerate an empty DB via the home.spec pattern (skip detail flow when no cards).
- CI wiring — local-only by decision.

---

## Step-by-Step Tasks

### Task 1: Trim the Playwright project matrix
- **ACTION**: Edit `playwright.config.ts` `projects[]`.
- **IMPLEMENT**: Keep exactly three projects:
  ```ts
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 12'] } },
  ],
  ```
  Remove the `firefox`, `mobile-pixel`, and `viewport-320` entries. Rename the iPhone project `mobile-safari` for clarity (was `mobile-iphone`).
- **MIRROR**: Existing `projects[]` block (lines 21-31) — keep `use: { ...devices[...] }` shape.
- **IMPORTS**: None new — `devices` already imported at line 1.
- **GOTCHA**: Leave `webServer`, `retries`, `reporter`, `use.baseURL` untouched. Dropping `viewport-320` removes a narrow-width check, but `home.spec.ts` already asserts no-overflow at 390/768/1024/1440 inside the chromium run, so narrow coverage remains. Note this trade-off; do not re-add it.
- **VALIDATE**: `pnpm exec playwright test --list` shows tests only across the 3 projects.

### Task 2: Create the paper-detail smoke spec
- **ACTION**: Create `tests/e2e/paper-detail.spec.ts`.
- **IMPLEMENT**: A `test.describe('paper detail + save/read', ...)` with `test.use({ viewport: { width: 1280, height: 900 } })` and a shared navigation helper. Three tests:
  1. **Navigate feed → detail renders**: `goto('/')`; locate `.paper-card-title-link`; if `count() === 0` → `test.skip(true, 'no papers seeded')`; click `.first()`; `await page.waitForURL(/\/papers\//, { timeout: 2000 })`; assert `getByRole('heading', { level: 1 })` is visible and the back link `getByRole('link', { name: /back to feed/i })` is visible.
  2. **Save toggle round-trips**: navigate to a detail page (reuse helper, skip if no cards); `const save = page.getByRole('button', { name: /save paper|unsave paper/i })`; read initial `aria-pressed`; click; assert `aria-pressed` flipped; click again; assert it returned to the initial value (leaves DB state clean).
  3. **Read toggle round-trips**: on a detail page; `const cb = page.getByRole('checkbox')`; capture `isChecked()`; click the surrounding label/checkbox; assert checked state flipped; click again; assert restored.
- **MIRROR**: TEST_IMPORTS_AND_SHAPE, ROLE_LOCATORS_AND_DETERMINISTIC_WAITS, EMPTY_DB_TOLERANCE, SAVE_BUTTON_A11Y, READ_TOGGLE_A11Y.
- **IMPORTS**: `import { expect, test } from '@playwright/test'`.
- **GOTCHA**:
  - There are many `.paper-card-title-link` on the feed → always use `.first()`.
  - Do the save/read assertions on the **detail page** (single SaveButton/ReadToggle); never on the feed where duplicates make `getByRole` ambiguous.
  - Save/read writes to the real local DB and calls `router.refresh()`. **Always toggle back** to the original state so the suite is idempotent and doesn't accumulate saved/read papers.
  - SaveButton is `disabled` while the optimistic transition is pending — after a click, assert on `aria-pressed` (Playwright auto-waits) rather than clicking again immediately; use a fresh `expect(...).toHaveAttribute('aria-pressed', ...)` between toggles so the second click waits for re-enable.
  - WebKit can be slightly slower on `router.refresh()`; rely on Playwright's auto-waiting `expect`, not fixed sleeps.
- **VALIDATE**: `pnpm exec playwright test paper-detail.spec.ts` passes on all 3 projects (or skips cleanly if the local DB is empty).

---

## Testing Strategy

This phase **is** the tests. Validation = the new + existing E2E suite going green.

### E2E Tests Added
| Test | Action | Expected | Edge Case? |
|---|---|---|---|
| feed → detail renders | click first card title | URL `/papers/...`, h1 + back link visible | skips if 0 cards |
| save toggle | click save twice | aria-pressed flips then restores | disabled-while-pending |
| read toggle | click checkbox twice | checked flips then restores | disabled-while-pending |

### Edge Cases Checklist
- [x] Empty DB (no papers) → detail tests `test.skip` cleanly
- [x] Multiple cards → `.first()` avoids strict-mode locator violation
- [x] Optimistic pending disable → assert via auto-waiting `expect`
- [x] WebKit timing → no fixed sleeps, auto-wait only
- [x] State mutation → toggle-back keeps DB clean

---

## Validation Commands

### Static Analysis
```bash
cd app && pnpm typecheck
```
EXPECT: Zero type errors.

### Lint
```bash
cd app && pnpm lint
```
EXPECT: Zero errors.

### List projects (confirm matrix trim)
```bash
cd app && pnpm exec playwright test --list
```
EXPECT: Tests enumerated only under `chromium`, `webkit`, `mobile-safari`.

### Run the new spec
```bash
cd app && pnpm exec playwright test paper-detail.spec.ts
```
EXPECT: All pass (or skip if DB empty).

### Full E2E suite
```bash
cd app && pnpm e2e
```
EXPECT: All specs green across the 3 projects; no regressions in home/filters/search.

### Manual Validation
- [ ] `pnpm dev` running; `pnpm e2e` green locally on Chrome, desktop Safari, mobile Safari
- [ ] After the run, no stray saved/read papers left behind (toggle-back worked)

---

## Acceptance Criteria
- [ ] `playwright.config.ts` has exactly 3 projects (chromium, webkit, mobile-safari)
- [ ] `tests/e2e/paper-detail.spec.ts` covers navigate→detail, save toggle, read toggle
- [ ] `pnpm e2e` green across all 3 projects
- [ ] No type errors, no lint errors
- [ ] Existing home/filters/search specs still pass

## Completion Checklist
- [ ] Code follows discovered Playwright patterns (role locators, `waitForURL`, empty-DB tolerance)
- [ ] No fixed `sleep`/`waitForTimeout` — deterministic waits only
- [ ] Tests leave DB state unchanged (toggle-back)
- [ ] No hardcoded paper IDs — navigate via the live feed
- [ ] Self-contained — no further codebase searching needed

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Local DB empty during run → detail tests skip, reducing coverage | M | M | Run against seeded local dev DB; skip is explicit, not a false pass |
| WebKit flakiness on optimistic refresh | M | L | Auto-waiting `expect`, no fixed timeouts, toggle-back between asserts |
| Removing viewport-320 loses narrowest overflow check | L | L | 390px overflow still asserted in home.spec; documented trade-off |

## Notes
- Components live under `src/components/paper-actions/` and `src/components/paper-detail/` (CLAUDE.md's §5 lists an older `paper/` path — the codebase is the source of truth).
- `papers/[id]/page.tsx` already calls `notFound()` for missing papers and handles `getPaperById` errors inline — relevant context for PRD Phase 2 (error/404 screens), not this phase.
- After this plan completes, run `/prp-plan app/docs/A9-PRD.md` again to plan Phase 2 (failure screens) and Phase 3 (a11y sweep).

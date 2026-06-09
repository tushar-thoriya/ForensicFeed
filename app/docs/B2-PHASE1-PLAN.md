# Plan: B2 Phase 1 — Digest Query + Env

## Summary

Build the data layer for the weekly email digest: a query that returns the week's
high-relevance newly-ingested papers, plus the `DIGEST_RECIPIENT` env var that says
where the digest will be sent. No email, no cron, no template yet — just the inputs the
later phases consume. Follows the existing pure-builder + executor query pattern so the
SQL shape is unit-testable without a database.

## User Story

As the single user/operator, I want a tested query that selects "high-relevance papers
ingested in the last 7 days" and a validated recipient address, so that Phase 3 can drop
those papers into an email and send it to me.

## Problem → Solution

Papers accumulate daily but there is no query that answers "what new, relevant papers
arrived this week?" and no configured destination for a digest. → A pure
`buildDigestQuery` + executor `fetchWeeklyDigestPapers`, and a `DIGEST_RECIPIENT` env
value validated at boot.

## Metadata

- **Complexity**: Small
- **Source PRD**: `app/docs/B2-PRD.md`
- **PRD Phase**: Phase 1 — Query + env
- **Estimated Files**: 4 (2 source, 1 test, 1 env-example) + 1 env edit + 1 test edit

---

## UX Design

Internal change — no user-facing UX transformation. (The email a user eventually
*receives* is Phase 2's template; this phase produces only data + config.)

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `src/lib/db/queries/list-papers-query.ts` | 1-108 | The pure-builder pattern to mirror exactly (PgDialect compile, clampLimit, SQL[] conditions, `buildOrderBy`) |
| P0 | `src/lib/env.ts` | 1-82 | Zod env pattern: `serverSchema`, `optionalString`/`emptyToUndefined`, `processEnv` mapping, cached `getEnv()` |
| P0 | `src/lib/db/queries/papers.ts` | 117-197 | `listRecentPapers` — the real `db.select({...}).from(papers).where(and(...)).orderBy(...).limit()` executor pattern |
| P1 | `tests/unit/list-papers.test.ts` | 1-250 | Exact test style: `@vitest-environment node`, assert on `{ sql, params }` from the builder |
| P1 | `tests/unit/env.server.test.ts` | 1-16 | Env test style (dynamic import after setting `process.env`) |
| P1 | `src/lib/db/schema.ts` | 40-79 | `papers` columns: `relevanceScore` (real), `createdAt` (timestamptz), `publishedDate`, `relevanceTags` (jsonb), `pdfUrl`, `arxivId`, `venue`, `venueType`, `authors` |
| P2 | `src/lib/db/client.ts` | all | `db` import path and pooled-client setup |

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| — | — | No external research needed — Phase 1 uses only established internal Drizzle + Zod patterns. Resend is not touched until Phase 3. |

---

## Patterns to Mirror

### NAMING_CONVENTION
```ts
// SOURCE: src/lib/db/queries/list-papers-query.ts:8-29
export const MAX_FEED_LIMIT = 200
export const DEFAULT_FEED_LIMIT = 50
function clampLimit(value: number | undefined): number {
  const n = value ?? DEFAULT_FEED_LIMIT
  return Math.min(Math.max(n, 1), MAX_FEED_LIMIT)
}
```
→ UPPER_SNAKE_CASE constants, camelCase functions, `build*Query` for pure builders.

### PURE_QUERY_BUILDER (test seam)
```ts
// SOURCE: src/lib/db/queries/list-papers-query.ts:87-108
const dialect = new PgDialect()
export function buildListPapersQuery(input: BuildListPapersInput): CompiledQuery {
  const conditions = buildConditions(input)
  const orderBy = buildOrderBy(input.filters)
  const limit = clampLimit(input.limit)
  const whereClause = and(...conditions) as SQL
  const orderClause = sql.join(orderBy, sql`, `)
  const composed = sql`select * from ${papers} where ${whereClause} order by ${orderClause} limit ${limit}`
  const compiled = dialect.sqlToQuery(composed)
  return { sql: compiled.sql, params: compiled.params, conditions, orderBy, limit }
}
```
→ Mirror this: a pure builder returns `{ sql, params, ... }` so tests assert SQL shape with **no DB**.

### EXECUTOR_PATTERN
```ts
// SOURCE: src/lib/db/queries/papers.ts:159-196
const rows = await db
  .select({ id: papers.id, title: papers.title, /* …explicit columns… */ })
  .from(papers)
  .where(and(...conditions))
  .orderBy(...orderBy)
  .limit(clampedLimit)
return rows
```
→ Executor selects an explicit column list, applies the same conditions/orderBy, clamps limit.

### ENV_PATTERN
```ts
// SOURCE: src/lib/env.ts:3-33, 44-63
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v)
const serverSchema = z.object({
  // …
  RESEND_API_KEY: optionalString(),
})
const processEnv = {
  // …
  RESEND_API_KEY: process.env.RESEND_API_KEY,
}
```
→ Add the new var to BOTH `serverSchema` and the `processEnv` map. Use `z.preprocess(emptyToUndefined, …)` so an empty string is treated as unset.

### TEST_STRUCTURE
```ts
// SOURCE: tests/unit/list-papers.test.ts:1-15
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildListPapersQuery } from '@/lib/db/queries/list-papers-query'

it('applies minRelevance gate by default', () => {
  const { sql, params } = buildListPapersQuery({ filters: EMPTY_FILTERS, minRelevance: 0.2 })
  expect(sql).toMatch(/relevance_score/)
  expect(params).toContain(0.2)
})
```
→ `@vitest-environment node` header, assert `sql` regex + `params` membership.

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `src/lib/db/queries/digest-query.ts` | CREATE | Pure `buildDigestQuery` + executor `fetchWeeklyDigestPapers` |
| `tests/unit/digest-query.test.ts` | CREATE | Unit tests for the pure builder (threshold, 7-day window, ordering, cap, empty) |
| `src/lib/env.ts` | UPDATE | Add `DIGEST_RECIPIENT` to `serverSchema` + `processEnv` |
| `tests/unit/env.server.test.ts` | UPDATE | Assert `DIGEST_RECIPIENT` parses (valid email passes, absent is allowed) |
| `.env.example` | UPDATE | Document `DIGEST_RECIPIENT` under the Phase B block |
| `src/types/digest.ts` | CREATE *(optional)* | `DigestPaper` row type if the executor's select shape is reused by Phase 2 |

## NOT Building (this phase)

- The email template / HTML (Phase 2)
- The Resend send wrapper or the Inngest cron job (Phase 3)
- Any production wiring, Vercel env, or deploy (Phase 4)
- A `digest_runs` table (deferred; Inngest run history is the audit trail)
- Reading `RESEND_API_KEY` for sending — it already exists in env; not exercised here
- `isSaved`/`isRead`/`headline` projections — the digest has no user-state or search context

---

## Step-by-Step Tasks

### Task 1: Add `DIGEST_RECIPIENT` to env
- **ACTION**: Edit `src/lib/env.ts`.
- **IMPLEMENT**: In `serverSchema`, beside `RESEND_API_KEY`, add:
  `DIGEST_RECIPIENT: z.preprocess(emptyToUndefined, z.string().email().optional()),`
  In `processEnv`, add: `DIGEST_RECIPIENT: process.env.DIGEST_RECIPIENT,`
- **MIRROR**: ENV_PATTERN.
- **IMPORTS**: none new (`z` already imported).
- **GOTCHA**: Keep it `.optional()` — making it required would break local dev/test boot
  (and the existing `env.server.test.ts`, which sets no recipient). Production presence is
  enforced later in Phase 3/4, not here. It must live in `serverSchema` (never
  `clientSchema`) — a recipient address must never reach the browser bundle.
- **VALIDATE**: `pnpm typecheck` clean; `getEnv()` still parses with the var unset.

### Task 2: Define digest constants + input type
- **ACTION**: Create `src/lib/db/queries/digest-query.ts`, top section.
- **IMPLEMENT**:
  ```ts
  export const DIGEST_RELEVANCE_THRESHOLD = 0.2  // matches feed default (CLAUDE.md: relevance threshold 0.2)
  export const DIGEST_WINDOW_DAYS = 7
  export const DIGEST_MAX_PAPERS = 20
  export interface BuildDigestQueryInput {
    since: Date            // lower bound on createdAt (caller computes now - 7d)
    threshold?: number     // defaults to DIGEST_RELEVANCE_THRESHOLD
    limit?: number         // defaults to DIGEST_MAX_PAPERS
  }
  export interface CompiledDigestQuery { sql: string; params: unknown[]; limit: number }
  ```
- **MIRROR**: NAMING_CONVENTION (UPPER_SNAKE_CASE constants, exported input interface).
- **GOTCHA**: `since` is passed IN, not computed here — keeps the builder pure and the
  7-day boundary testable with a fixed clock.
- **VALIDATE**: `pnpm typecheck` clean.

### Task 3: Implement the pure `buildDigestQuery`
- **ACTION**: Same file.
- **IMPLEMENT**:
  ```ts
  import { and, desc, gte, sql, type SQL } from 'drizzle-orm'
  import { PgDialect } from 'drizzle-orm/pg-core'
  import { papers } from '@/lib/db/schema'
  const dialect = new PgDialect()

  function clampDigestLimit(v: number | undefined): number {
    const n = v ?? DIGEST_MAX_PAPERS
    return Math.min(Math.max(n, 1), DIGEST_MAX_PAPERS)
  }
  export function buildDigestConditions(input: BuildDigestQueryInput): SQL[] {
    const threshold = input.threshold ?? DIGEST_RELEVANCE_THRESHOLD
    return [gte(papers.relevanceScore, threshold), gte(papers.createdAt, input.since)]
  }
  export function buildDigestQuery(input: BuildDigestQueryInput): CompiledDigestQuery {
    const conditions = buildDigestConditions(input)
    const orderBy: SQL[] = [desc(papers.relevanceScore), desc(papers.publishedDate)]
    const limit = clampDigestLimit(input.limit)
    const whereClause = and(...conditions) as SQL
    const orderClause = sql.join(orderBy, sql`, `)
    const composed = sql`select * from ${papers} where ${whereClause} order by ${orderClause} limit ${limit}`
    const compiled = dialect.sqlToQuery(composed)
    return { sql: compiled.sql, params: compiled.params, limit }
  }
  ```
- **MIRROR**: PURE_QUERY_BUILDER.
- **GOTCHA**: The window condition is `gte(papers.createdAt, since)` — **`createdAt`, not
  `publishedDate`**. This is the whole reason for a separate query: the existing
  `buildConditions` (`list-papers-query.ts:56`) keys `since` off `publishedDate`, which
  would miss late-discovered papers. Order by `relevanceScore desc` then `publishedDate
  desc` (best + freshest first).
- **VALIDATE**: see Task 5 tests.

### Task 4: Implement the executor `fetchWeeklyDigestPapers`
- **ACTION**: Same file.
- **IMPLEMENT**:
  ```ts
  import { db } from '@/lib/db/client'
  // explicit, minimal projection — what an email row needs
  export interface DigestPaper {
    id: string; title: string; authors: string[]; venue: string | null
    venueType: typeof papers.$inferSelect.venueType; relevanceScore: number
    relevanceTags: string[]; pdfUrl: string | null; arxivId: string | null
    publishedDate: Date; createdAt: Date
  }
  export async function fetchWeeklyDigestPapers(
    input: BuildDigestQueryInput,
  ): Promise<DigestPaper[]> {
    const conditions = buildDigestConditions(input)
    const limit = clampDigestLimit(input.limit)
    const rows = await db
      .select({
        id: papers.id, title: papers.title, authors: papers.authors,
        venue: papers.venue, venueType: papers.venueType,
        relevanceScore: papers.relevanceScore, relevanceTags: papers.relevanceTags,
        pdfUrl: papers.pdfUrl, arxivId: papers.arxivId,
        publishedDate: papers.publishedDate, createdAt: papers.createdAt,
      })
      .from(papers)
      .where(and(...conditions))
      .orderBy(desc(papers.relevanceScore), desc(papers.publishedDate))
      .limit(limit)
    return rows
  }
  ```
- **MIRROR**: EXECUTOR_PATTERN (`papers.ts:159-196`).
- **GOTCHA**: No `leftJoin` on `userSaves`/`readStatus` — digest is content-only, doesn't
  need read/saved state. Keep the projection explicit so drizzle infers a clean type.
  Empty result returns `[]` (the Phase 3 job branches to the "quiet week" note on `length === 0`).
- **VALIDATE**: covered indirectly; executor isn't unit-tested against a live DB in Phase 1
  (the pure builder is the seam). Real-data check happens in Phase 4.

### Task 5: Unit tests for the builder
- **ACTION**: Create `tests/unit/digest-query.test.ts`.
- **IMPLEMENT**: `@vitest-environment node`; cases:
  - default threshold gate present → `sql` matches `/relevance_score/`, `params` contains `0.2`
  - custom threshold honored → `params` contains the custom value
  - `createdAt` window applied → `sql` matches `/created_at/`, `params` contains `since.toISOString()`
  - window keys off `created_at`, **NOT** `published_date` in WHERE → regression guard
  - ORDER BY is `relevance_score desc` then `published_date desc` (assert index order, mirror `list-papers.test.ts:129-139`)
  - limit clamps to `DIGEST_MAX_PAPERS` (20) when oversized; min 1; default 20 when unset
- **MIRROR**: TEST_STRUCTURE.
- **GOTCHA**: Use a fixed `since = new Date('2026-06-02T00:00:00Z')`; assert
  `params).toContain(since.toISOString())` (drizzle binds timestamps as ISO strings —
  see `list-papers.test.ts:24-26`).
- **VALIDATE**: `pnpm test:ci` — these pass; ≥80% coverage on the new file.

### Task 6: Extend env test + `.env.example`
- **ACTION**: Edit `tests/unit/env.server.test.ts` and `.env.example`.
- **IMPLEMENT**: In the env test, set `process.env.DIGEST_RECIPIENT = 'test@example.com'`
  before the dynamic import and assert `env.DIGEST_RECIPIENT === 'test@example.com'`; add a
  second case asserting it parses to `undefined` when unset. In `.env.example`, under the
  Phase B block near `RESEND_API_KEY`, add:
  `DIGEST_RECIPIENT=` with a one-line comment ("Where the weekly digest is emailed").
- **MIRROR**: env.server.test.ts:1-16.
- **GOTCHA**: `getEnv()` caches — the existing test imports `@/lib/env` dynamically to get
  a fresh module; keep new assertions in their own `it` blocks with their own dynamic
  import, or set the var before the first import in the file. Don't rely on ordering.
- **VALIDATE**: `pnpm test:ci` green.

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected | Edge? |
|---|---|---|---|
| default threshold | `{ since }` | `params` ∋ 0.2, sql ∋ relevance_score | — |
| custom threshold | `{ since, threshold: 0.5 }` | `params` ∋ 0.5 | — |
| window column | `{ since }` | sql ∋ created_at, params ∋ since.toISOString() | — |
| window NOT publishedDate (WHERE) | `{ since }` | WHERE clause ∌ published_date | regression |
| order precedence | `{ since }` | relevance_score before published_date in ORDER BY | — |
| cap oversized | `{ since, limit: 9999 }` | params ∋ 20 | max |
| cap min | `{ since, limit: 0 }` | params ∋ 1 | min |
| default cap | `{ since }` | params ∋ 20 | — |
| env present | `DIGEST_RECIPIENT=test@example.com` | parses to that value | — |
| env absent | unset | parses to `undefined` | empty |

### Edge Cases Checklist
- [x] Empty input → executor returns `[]` (no rows match)
- [x] Maximum size input → limit clamps to 20
- [x] Invalid types → Zod rejects a non-email `DIGEST_RECIPIENT`
- [ ] Concurrent access → N/A (read-only)
- [ ] Network failure → N/A (Phase 3 send concern)
- [ ] Permission denied → N/A

---

## Validation Commands

### Static Analysis
```bash
cd app && pnpm typecheck
```
EXPECT: Zero type errors.

### Unit Tests
```bash
cd app && pnpm test:ci
```
EXPECT: All pass, new `digest-query.test.ts` green, ≥80% coverage on new files.

### Lint / Format
```bash
cd app && pnpm lint && pnpm format:check
```
EXPECT: Clean.

### Manual Validation
- [ ] `getEnv()` boots with `DIGEST_RECIPIENT` set and unset
- [ ] `buildDigestQuery({ since }).sql` contains `created_at` and not `published_date` in WHERE

---

## Acceptance Criteria
- [ ] `digest-query.ts` exports `buildDigestQuery`, `fetchWeeklyDigestPapers`, constants
- [ ] Window keys off `createdAt`; threshold defaults to 0.2; cap 20
- [ ] `DIGEST_RECIPIENT` validated in `serverSchema` (optional email, server-only)
- [ ] All validation commands pass; tests written first (TDD)
- [ ] No type/lint errors

## Completion Checklist
- [ ] Mirrors PURE_QUERY_BUILDER + EXECUTOR_PATTERN exactly
- [ ] Test file uses `@vitest-environment node` + `{ sql, params }` assertions
- [ ] No hardcoded recipient; no secret in code
- [ ] No scope creep into template/send/cron
- [ ] Self-contained — no further codebase searching needed

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Confusing `createdAt` vs `publishedDate` window | M | High (wrong papers) | Explicit regression test asserting WHERE uses `created_at` |
| `getEnv()` cache leaks across env tests | L | Med (flaky test) | Dynamic import per case; set env before import |
| Drizzle timestamp binding format | L | Low | Assert on `.toISOString()` per existing test precedent |

## Notes
- The pure-builder/executor split is the codebase's established testability seam — the
  builder is unit-tested (no DB); the executor is exercised for real in Phase 4.
- Phases 1 and 2 are parallel per the PRD; this plan is Phase 1 only. Phase 2 (template)
  consumes the `DigestPaper[]` shape defined here.
- `NEXT_PUBLIC_APP_URL` (env.ts:38) will build in-app `/papers/[id]` links in Phase 2 —
  noted now so the template phase doesn't re-discover it.

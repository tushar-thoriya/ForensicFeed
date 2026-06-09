# Plan: B2 Phase 3 — Send Wrapper + Cron Job

## Summary

Wire Phase 1 (query) + Phase 2 (template) into a scheduled, idempotent email send.
A thin Resend wrapper (`send.ts`, dependency-injectable for tests) and an Inngest
function (`weekly-digest.ts`) on a Monday cron, plus a manual-trigger twin for Phase 4
testing. Idempotency comes from two layers: Inngest step memoization (a retry replays a
completed step, never re-runs it) and a Resend idempotency key derived from the week.

## User Story

As the single user, I want the digest to send itself every Monday — exactly once — so I
receive the week's papers without doing anything.

## Metadata
- **Complexity**: Medium
- **Source PRD**: `app/docs/B2-PRD.md` (Phase 3)
- **Estimated Files**: 5 (2 source, 1 test, 2 config/registration) + env + .env.example

## Mandatory Reading
| Priority | File | Why |
|---|---|---|
| P0 | `src/lib/inngest/ingest-arxiv.ts` | `inngest.createFunction({cron},...)` + `step.run` pattern + `*Functions` export array |
| P0 | `src/app/api/inngest/route.ts` | Where functions register via `serve({functions:[...]})` |
| P0 | `config/schedules.ts` | Add a `digest` entry + preset (single source of truth) |
| P1 | `src/lib/email/digest-template.ts` | `renderDigestEmail` consumed here |
| P1 | `src/lib/db/queries/digest-query.ts` | `fetchWeeklyDigestPapers`, `DIGEST_WINDOW_DAYS` |
| P1 | `src/lib/env.ts` | Add `DIGEST_FROM`; read `RESEND_API_KEY`/`DIGEST_RECIPIENT`/`NEXT_PUBLIC_APP_URL` |
| P2 | `src/lib/inngest/utils.ts` | `ONE_DAY_MS` |

## External Documentation
| Topic | Key Takeaway |
|---|---|
| Resend v6 `emails.send` | `send(payload, { idempotencyKey })` → returns `{ data: {id}|null, error: {message}|null }`; does NOT throw on API errors — must check `error`. Idempotency keys are honored ~24h. |
| Inngest steps | `step.run(id, fn)` memoizes results; on function retry, completed steps are replayed from memory, not re-executed → isolating the send in its own step prevents re-sends. Compute `new Date()` INSIDE a step for determinism. |

## Files to Change
| File | Action | Justification |
|---|---|---|
| `src/lib/email/send.ts` | CREATE | Resend wrapper; DI sender for tests; env guards |
| `src/lib/inngest/weekly-digest.ts` | CREATE | Cron + manual Inngest functions; build→send steps |
| `tests/unit/digest-send.test.ts` | CREATE | Guard + result logic via injected sender |
| `config/schedules.ts` | UPDATE | Add `WEEKLY_MONDAY_8AM` preset + `digest` schedule |
| `src/app/api/inngest/route.ts` | UPDATE | Register `...digestFunctions` |
| `src/lib/env.ts` | UPDATE | Add `DIGEST_FROM` (optional, default sender) |
| `.env.example` | UPDATE | Document `DIGEST_FROM` |

## NOT Building
- Real send / Vercel env / deploy (Phase 4)
- `digest_runs` audit table (Inngest run history suffices)
- Unit tests for the Inngest job itself (matches codebase: all `ingest-*.ts` jobs are
  exercised in integration/prod, 0% unit coverage — the testable logic is in send.ts)

## Step-by-Step Tasks

### Task 1: `DIGEST_FROM` env
- **ACTION**: `src/lib/env.ts` + `.env.example`.
- **IMPLEMENT**: `DIGEST_FROM: optionalString()` in serverSchema + processEnv map. In
  `.env.example` under Phase B: `DIGEST_FROM=` with comment ("Sender; defaults to onboarding@resend.dev").
- **GOTCHA**: server-only (never client). Optional — default applied in send.ts.
- **VALIDATE**: typecheck; getEnv parses unset.

### Task 2: `send.ts` (DI for testability)
- **ACTION**: CREATE `src/lib/email/send.ts`.
- **IMPLEMENT**:
  ```ts
  import { Resend } from 'resend'
  import { getEnv } from '@/lib/env'
  const DEFAULT_FROM = 'ForensicFeed <onboarding@resend.dev>'
  export interface SendDigestInput { subject: string; html: string; text: string; idempotencyKey?: string }
  export type EmailSender = (
    payload: { from: string; to: string; subject: string; html: string; text: string },
    options?: { idempotencyKey?: string },
  ) => Promise<{ data: { id: string } | null; error: { message: string } | null }>
  export interface SendDeps { sender?: EmailSender; apiKey?: string; recipient?: string; from?: string }
  export async function sendDigestEmail(input: SendDigestInput, deps: SendDeps = {}): Promise<{ id: string }> {
    const env = getEnv()
    const apiKey = deps.apiKey ?? env.RESEND_API_KEY
    const recipient = deps.recipient ?? env.DIGEST_RECIPIENT
    const from = deps.from ?? env.DIGEST_FROM ?? DEFAULT_FROM
    if (!apiKey) throw new Error('RESEND_API_KEY is not configured')
    if (!recipient) throw new Error('DIGEST_RECIPIENT is not configured')
    const send: EmailSender = deps.sender ?? ((p, o) => new Resend(apiKey).emails.send(p, o))
    const { data, error } = await send(
      { from, to: recipient, subject: input.subject, html: input.html, text: input.text },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
    )
    if (error) throw new Error(`Resend send failed: ${error.message}`)
    if (!data) throw new Error('Resend returned no data')
    return { id: data.id }
  }
  ```
- **GOTCHA**: Resend returns `{data,error}` — must throw on `error` so Inngest retries.
  Throwing on missing config = fail-fast.
- **VALIDATE**: tests in Task 4.

### Task 3: `weekly-digest.ts` (Inngest)
- **ACTION**: CREATE `src/lib/inngest/weekly-digest.ts`.
- **IMPLEMENT**:
  ```ts
  import { inngest } from '@/lib/inngest/client'
  import { fetchWeeklyDigestPapers, DIGEST_WINDOW_DAYS } from '@/lib/db/queries/digest-query'
  import { renderDigestEmail } from '@/lib/email/digest-template'
  import { sendDigestEmail } from '@/lib/email/send'
  import { getEnv } from '@/lib/env'
  import { SCHEDULES } from '@config/schedules'
  import { ONE_DAY_MS } from '@/lib/inngest/utils'

  async function buildWeeklyDigest() {
    const now = new Date()                                   // inside the step → deterministic on retry
    const weekStart = new Date(now.getTime() - DIGEST_WINDOW_DAYS * ONE_DAY_MS)
    const papers = await fetchWeeklyDigestPapers({ since: weekStart })
    const email = renderDigestEmail({ papers, weekStart, weekEnd: now, appUrl: getEnv().NEXT_PUBLIC_APP_URL })
    return { ...email, count: papers.length, weekStartIso: weekStart.toISOString().slice(0, 10) }
  }

  type Step = { run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T> }
  async function runDigest(step: Step) {
    const built = await step.run('build-digest', buildWeeklyDigest)
    const sent = await step.run('send-digest', () =>
      sendDigestEmail(
        { subject: built.subject, html: built.html, text: built.text },
        // 2nd idempotency layer; primary guard is step memoization above
      ),
    )
    return { count: built.count, emailId: sent.id }
  }
  ```
  Add the idempotency key: pass `idempotencyKey: \`weekly-digest-${built.weekStartIso}\`` into the
  `sendDigestEmail` input. Then export:
  ```ts
  export const weeklyDigestScheduled = inngest.createFunction(
    { id: 'weekly-digest', name: 'Weekly digest email' }, { cron: SCHEDULES.digest },
    async ({ step }) => runDigest(step),
  )
  export const weeklyDigestManual = inngest.createFunction(
    { id: 'weekly-digest-manual', name: 'Manual weekly digest' }, { event: 'digest/weekly.manual' },
    async ({ step }) => runDigest(step),
  )
  export const digestFunctions = [weeklyDigestScheduled, weeklyDigestManual]
  ```
- **GOTCHA**: `step.run` body must return JSON-serializable data — `{subject,html,text,count,weekStartIso}`
  are strings/number, fine. Compute `now` inside the step, never in the function root.
- **VALIDATE**: typecheck + build (registration compiles).

### Task 4: `config/schedules.ts` + route registration
- **ACTION**: UPDATE both.
- **IMPLEMENT**: Add `WEEKLY_MONDAY_8AM: '0 8 * * 1'` to PRESETS; add `digest: PRESETS.WEEKLY_MONDAY_8AM`
  to SCHEDULES with a comment. In `route.ts`, import `{ digestFunctions }` and spread `...digestFunctions`
  into the `functions` array.
- **VALIDATE**: typecheck + build.

### Task 5: `digest-send.test.ts`
- **ACTION**: CREATE `tests/unit/digest-send.test.ts`, `@vitest-environment node`.
- **CASES** (inject `sender`, `apiKey`, `recipient`, `from` via deps; set `process.env.DATABASE_URL`):
  - success → returns `{ id }`; sender received correct `from/to/subject/html/text`.
  - idempotencyKey forwarded to sender options when provided.
  - sender returns `error` → throws `/Resend send failed/`.
  - sender returns `{data:null,error:null}` → throws `/no data/`.
  - missing apiKey (deps.apiKey='') → throws `/RESEND_API_KEY/`.
  - missing recipient → throws `/DIGEST_RECIPIENT/`.
- **VALIDATE**: `pnpm vitest run tests/unit/digest-send.test.ts`.

## Testing Strategy
| Test | Input | Expected |
|---|---|---|
| success | valid deps + sender ok | `{id}` returned, payload correct |
| idempotency | input.idempotencyKey set | sender opts `{idempotencyKey}` |
| resend error | sender → error | throws "Resend send failed" |
| null data | sender → no data | throws "no data" |
| no api key | apiKey '' | throws "RESEND_API_KEY" |
| no recipient | recipient '' | throws "DIGEST_RECIPIENT" |

### Edge Cases
- [x] Missing config → fail-fast throw
- [x] Resend API error → throw (Inngest retries)
- [x] Empty digest → still sends (quiet-week email from Phase 2); job doesn't special-case

## Validation Commands
```bash
cd app && pnpm typecheck && pnpm eslint src/lib/email/send.ts src/lib/inngest/weekly-digest.ts src/app/api/inngest/route.ts config/schedules.ts tests/unit/digest-send.test.ts && pnpm vitest run tests/unit/digest-send.test.ts && pnpm build
```
EXPECT: clean, green, build OK.

## Acceptance Criteria
- [ ] `sendDigestEmail` guards config, throws on error, returns id
- [ ] `weekly-digest` cron + manual functions registered and build
- [ ] `digest` schedule in config; send isolated in its own step
- [ ] send.ts tested (~100%); job file follows no-unit-test precedent
- [ ] typecheck + lint + build clean

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Double-send on retry | M | High | Send isolated in `step.run` (memoized) + Resend idempotency key per week |
| Non-deterministic `now` across retries | L | Med | Compute `now` inside `build-digest` step |
| Resend silent error (no throw) | M | High | Explicitly check `error`/`data`, throw |

## Notes
- Phase 4 will trigger `digest/weekly.manual` to do a real test send, then set
  `RESEND_API_KEY`/`DIGEST_RECIPIENT` in Vercel and confirm the cron registers.
- Sender defaults to `onboarding@resend.dev` (Resend's no-domain sender) — fine for a
  personal tool; override via `DIGEST_FROM` after verifying a domain.

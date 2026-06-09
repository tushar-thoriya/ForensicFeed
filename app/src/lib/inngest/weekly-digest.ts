import { inngest } from '@/lib/inngest/client'
import { DIGEST_WINDOW_DAYS } from '@/lib/db/queries/digest-query'
import { fetchWeeklyDigestPapers } from '@/lib/db/queries/papers'
import { renderDigestEmail } from '@/lib/email/digest-template'
import { sendDigestEmail } from '@/lib/email/send'
import { getEnv } from '@/lib/env'
import { SCHEDULES } from '@config/schedules'
import { ONE_DAY_MS } from '@/lib/inngest/utils'

// Builds the email content for the trailing DIGEST_WINDOW_DAYS. `now` is computed
// here (inside the step) so that on an Inngest retry the memoized step result is
// reused rather than recomputing a drifted window.
async function buildWeeklyDigest() {
  const now = new Date()
  const weekStart = new Date(now.getTime() - DIGEST_WINDOW_DAYS * ONE_DAY_MS)
  const papers = await fetchWeeklyDigestPapers({ since: weekStart })
  const email = renderDigestEmail({
    papers,
    weekStart,
    weekEnd: now,
    appUrl: getEnv().NEXT_PUBLIC_APP_URL,
  })
  return {
    subject: email.subject,
    html: email.html,
    text: email.text,
    count: papers.length,
    weekStartIso: weekStart.toISOString().slice(0, 10),
  }
}

// The two-step shape is load-bearing for idempotency: a function retry replays
// the completed `send-digest` step from memory instead of re-sending. The body
// is written inline in each function (rather than a shared helper) so Inngest's
// own `step` typing — which Jsonify-wraps step return values — applies cleanly.
export const weeklyDigestScheduled = inngest.createFunction(
  { id: 'weekly-digest', name: 'Weekly digest email' },
  { cron: SCHEDULES.digest },
  async ({ step }) => {
    const built = await step.run('build-digest', buildWeeklyDigest)
    const sent = await step.run('send-digest', () =>
      sendDigestEmail({
        subject: built.subject,
        html: built.html,
        text: built.text,
        idempotencyKey: `weekly-digest-${built.weekStartIso}`,
      }),
    )
    return { count: built.count, emailId: sent.id }
  },
)

export const weeklyDigestManual = inngest.createFunction(
  { id: 'weekly-digest-manual', name: 'Manual weekly digest' },
  { event: 'digest/weekly.manual' },
  async ({ step }) => {
    const built = await step.run('build-digest', buildWeeklyDigest)
    const sent = await step.run('send-digest', () =>
      sendDigestEmail({
        subject: built.subject,
        html: built.html,
        text: built.text,
        idempotencyKey: `weekly-digest-${built.weekStartIso}`,
      }),
    )
    return { count: built.count, emailId: sent.id }
  },
)

export const digestFunctions = [weeklyDigestScheduled, weeklyDigestManual]

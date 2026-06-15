/**
 * Manual digest test-send (B2 Phase 4 verification).
 *
 * Runs the real digest pipeline once — fetch this week's high-relevance papers,
 * render the email, send it via Resend — so the result can be checked in a real
 * inbox before the Monday cron is enabled. Skips the Inngest orchestration layer
 * (idempotency is unit-tested separately); each run sends a fresh email.
 *
 *   npx tsx scripts/test-digest-send.ts
 *
 * Requires RESEND_API_KEY, DIGEST_RECIPIENT, DATABASE_URL, NEXT_PUBLIC_APP_URL
 * in .env.local.
 */
import { config } from 'dotenv'

config({ path: '.env.local' })

const ONE_DAY_MS = 24 * 60 * 60 * 1000

async function main() {
  // Dynamic imports so dotenv populates process.env before any module reads env.
  const { DIGEST_WINDOW_DAYS } = await import('@/lib/db/queries/digest-query')
  const { fetchWeeklyDigestPapers } = await import('@/lib/db/queries/papers')
  const { renderDigestEmail } = await import('@/lib/email/digest-template')
  const { sendDigestEmail } = await import('@/lib/email/send')
  const { getEnv } = await import('@/lib/env')

  const now = new Date()
  const weekStart = new Date(now.getTime() - DIGEST_WINDOW_DAYS * ONE_DAY_MS)

  const papers = await fetchWeeklyDigestPapers({ since: weekStart })
  console.log(
    `Found ${papers.length} paper(s) from ${weekStart.toISOString().slice(0, 10)} to ${now
      .toISOString()
      .slice(0, 10)}`,
  )

  const email = renderDigestEmail({
    papers,
    weekStart,
    weekEnd: now,
    appUrl: getEnv().NEXT_PUBLIC_APP_URL,
  })
  console.log(`Subject: ${email.subject}`)
  console.log(`Recipient: ${getEnv().DIGEST_RECIPIENT}`)

  const sent = await sendDigestEmail({
    subject: email.subject,
    html: email.html,
    text: email.text,
    idempotencyKey: `manual-test-${now.toISOString()}`,
  })
  console.log(`Sent — Resend email id: ${sent.id}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test send failed:', err)
    process.exit(1)
  })

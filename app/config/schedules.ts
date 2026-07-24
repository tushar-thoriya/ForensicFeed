// =============================================================================
// Ingestion Schedules
// =============================================================================
//
// Single source of truth for WHEN each ingestion job runs in production.
// Edit values in the SCHEDULES block at the bottom to change cadence.
// After editing: commit + push → Vercel deploys → Inngest auto-syncs schedules.
//
// All times are UTC. Tip: 06:00 UTC = 11:30 IST = early-morning Europe.
//
// -----------------------------------------------------------------------------
// CRON SYNTAX CHEAT-SHEET
// -----------------------------------------------------------------------------
//
//   ┌─── minute            (0-59)
//   │ ┌─── hour            (0-23, UTC)
//   │ │ ┌─── day of month  (1-31, * = any)
//   │ │ │ ┌─── month       (1-12, * = any)
//   │ │ │ │ ┌─── day of week (0-6, 0 = Sunday, * = any)
//   │ │ │ │ │
//   0 6 * * *      ← daily at 06:00 UTC
//   0 6 * * 1      ← weekly on Monday at 06:00 UTC
//   0 6 1 * *      ← monthly on the 1st at 06:00 UTC
//   */15 * * * *   ← every 15 minutes
//
// Key tricks:
//   - DAILY → WEEKLY: change last "*" to a day number
//     0 = Sunday, 1 = Monday, ..., 6 = Saturday
//   - DAILY → MONTHLY: change the 3rd "*" to a day-of-month (1-31)
//
// Test any cron string at https://crontab.guru/ — it shows the next 5 fire times.
//
// =============================================================================

// Reusable presets — add more as needed, then reference them in SCHEDULES below.
// These all times are in "UTC" not "IST"(indian standard time)
const PRESETS = {
  DAILY_6AM: '0 6 * * *',
  DAILY_6_15AM: '15 6 * * *',
  DAILY_6_30AM: '30 6 * * *',
  WEEKLY_MONDAY_6AM: '0 6 * * 1',
  WEEKLY_MONDAY_7AM: '0 7 * * 1',
  WEEKLY_MONDAY_7_30AM: '30 7 * * 1',
  WEEKLY_MONDAY_2_30AM: '30 2 * * 1',
  WEEKLY_SUNDAY_6AM: '0 6 * * 0',
  MONTHLY_FIRST_6AM: '0 6 1 * *',
} as const

// Edit only this block to change ingestion cadence.
// Each value must be a valid cron string (5 fields, space-separated, UTC).
export const SCHEDULES = {
  // arXiv cs.CV — fast, no rate limits, fresh papers daily
  arxiv: PRESETS.DAILY_6AM,

  // Hugging Face Papers — curated daily list
  huggingface: PRESETS.DAILY_6_15AM,

  // Semantic Scholar — citation/recommendation refresh
  semanticScholar: PRESETS.DAILY_6_30AM,

  // CVF (CVPR/ICCV/WACV) — conference proceedings rarely change
  cvf: PRESETS.WEEKLY_MONDAY_7AM,

  // OpenReview (ICLR/NeurIPS) — conference cycle, weekly is plenty
  openReview: PRESETS.WEEKLY_MONDAY_7_30AM,

  // greatzh/papers — hand-curated GitHub list, updated on the author's own
  // cadence rather than a publication schedule; weekly sweep is enough since
  // the DB upsert makes re-fetching the same entries a no-op.
  greatzh: PRESETS.WEEKLY_MONDAY_6AM,

  // Weekly email digest (B2) — Monday morning, after the weekend's papers land
  digest: PRESETS.WEEKLY_MONDAY_2_30AM,
} as const

export type ScheduleKey = keyof typeof SCHEDULES

import type { DigestPaper } from '@/lib/db/queries/digest-query'

// How many papers render as full cards before the rest collapse into a compact
// list. Keeps the email short while still surfacing every relevant paper.
export const DIGEST_FULL_CARDS = 5

export interface RenderDigestInput {
  papers: DigestPaper[]
  weekStart: Date
  weekEnd: Date
  appUrl: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

// Email-safe palette. The app's design tokens are oklch CSS custom properties
// (src/styles/tokens.css), but email clients — Gmail especially — cannot resolve
// oklch() or var(--…). These literal hex values are the deliberate, isolated
// translation of that palette for the email surface only.
const C = {
  page: '#f4f4f5',
  surface: '#ffffff',
  text: '#1f1f1f',
  secondary: '#5e5e5e',
  muted: '#6b6b6b',
  border: '#e0e0e0',
  accent: '#3a5bd9',
  accentStrong: '#2a3fa8',
  tagBg: '#eef0f7',
  tagText: '#3a4570',
} as const

const SERIF = "Georgia,'Times New Roman',serif"
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
const MONO = "ui-monospace,SFMono-Regular,Menlo,monospace"

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatAuthors(authors: string[]): string {
  if (authors.length === 0) return ''
  if (authors.length <= 3) return authors.join(', ')
  return `${authors.slice(0, 3).join(', ')} et al.`
}

function paperUrl(appUrl: string, id: string): string {
  return `${appUrl.replace(/\/$/, '')}/papers/${encodeURIComponent(id)}`
}

function externalUrl(p: DigestPaper): string | null {
  if (p.pdfUrl) return p.pdfUrl
  if (p.arxivId) return `https://arxiv.org/abs/${p.arxivId}`
  return null
}

function formatScore(score: number): string {
  return score.toFixed(2)
}

function venueLabel(p: DigestPaper): string {
  return p.venue ?? p.venueType
}

function formatRange(start: Date, end: Date): string {
  const md = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const year = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'UTC' }).format(end)
  return `${md.format(start)} – ${md.format(end)}, ${year}`
}

function tagsHtml(tags: string[]): string {
  if (tags.length === 0) return ''
  const chips = tags
    .map(
      (t) =>
        `<span style="display:inline-block;margin:0 6px 0 0;padding:2px 8px;background:${C.tagBg};color:${C.tagText};border-radius:4px;font:500 12px/1.4 ${MONO};">${escapeHtml(t)}</span>`,
    )
    .join('')
  return `<div style="margin-top:10px;">${chips}</div>`
}

function externalLinkHtml(p: DigestPaper): string {
  const url = externalUrl(p)
  if (!url) return ''
  const label = p.pdfUrl ? 'Read PDF' : 'Read on arXiv'
  return `<a href="${escapeHtml(url)}" style="color:${C.accent};text-decoration:none;font:500 13px/1.4 ${SANS};">${label} →</a>`
}

function cardHtml(p: DigestPaper, appUrl: string): string {
  const authors = formatAuthors(p.authors)
  const authorsLine = authors
    ? `<div style="margin:4px 0 0;color:${C.secondary};font:14px/1.5 ${SANS};">${escapeHtml(authors)}</div>`
    : ''
  return `
  <div data-section="card" style="padding:18px 0;border-bottom:1px solid ${C.border};">
    <div style="color:${C.muted};font:500 12px/1.4 ${MONO};letter-spacing:0.04em;text-transform:uppercase;">
      ${escapeHtml(venueLabel(p))} · score ${formatScore(p.relevanceScore)}
    </div>
    <a href="${escapeHtml(paperUrl(appUrl, p.id))}" style="display:block;margin:6px 0 0;color:${C.text};text-decoration:none;font:600 19px/1.3 ${SERIF};">
      ${escapeHtml(p.title)}
    </a>
    ${authorsLine}
    ${tagsHtml(p.relevanceTags)}
    <div style="margin-top:10px;">${externalLinkHtml(p)}</div>
  </div>`
}

function compactItemHtml(p: DigestPaper, appUrl: string): string {
  return `
  <li style="margin:0 0 10px;font:14px/1.5 ${SANS};color:${C.secondary};">
    <a href="${escapeHtml(paperUrl(appUrl, p.id))}" style="color:${C.text};text-decoration:none;font-weight:600;">${escapeHtml(p.title)}</a>
    <span style="color:${C.muted};font:12px/1.4 ${MONO};"> — ${escapeHtml(venueLabel(p))} · ${formatScore(p.relevanceScore)}</span>
  </li>`
}

function shell(inner: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${C.page};">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px;">
    <div style="background:${C.surface};border:1px solid ${C.border};border-radius:8px;padding:28px 24px;">
      ${inner}
    </div>
  </div>
</body></html>`
}

function masthead(range: string): string {
  return `
  <div style="color:${C.muted};font:500 12px/1.4 ${MONO};letter-spacing:0.18em;text-transform:uppercase;">FORENSICFEED · WEEKLY DIGEST</div>
  <div style="margin:6px 0 18px;color:${C.secondary};font:14px/1.5 ${SANS};">${escapeHtml(range)}</div>`
}

function footerHtml(appUrl: string): string {
  return `<div style="margin-top:20px;padding-top:16px;border-top:1px solid ${C.border};">
    <a href="${escapeHtml(appUrl)}" style="color:${C.accent};text-decoration:none;font:500 14px/1.4 ${SANS};">Browse all in ForensicFeed →</a>
  </div>`
}

function renderQuiet(input: RenderDigestInput): RenderedEmail {
  const range = formatRange(input.weekStart, input.weekEnd)
  const html = shell(
    `${masthead(range)}
    <p style="margin:0;color:${C.text};font:16px/1.6 ${SERIF};">No new high-relevance papers this week.</p>
    ${footerHtml(input.appUrl)}`,
  )
  const text = `ForensicFeed · Weekly Digest\n${range}\n\nNo new high-relevance papers this week.\n\nBrowse: ${input.appUrl}\n`
  return { subject: 'ForensicFeed · quiet week — no new papers', html, text }
}

function paperText(p: DigestPaper, appUrl: string): string {
  const authors = formatAuthors(p.authors)
  const ext = externalUrl(p)
  const lines = [
    `- ${p.title}`,
    authors ? `  ${authors}` : '',
    `  ${venueLabel(p)} · score ${formatScore(p.relevanceScore)}`,
    `  ${paperUrl(appUrl, p.id)}`,
    ext ? `  ${ext}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

export function renderDigestEmail(input: RenderDigestInput): RenderedEmail {
  const { papers, appUrl } = input
  if (papers.length === 0) return renderQuiet(input)

  const range = formatRange(input.weekStart, input.weekEnd)
  const full = papers.slice(0, DIGEST_FULL_CARDS)
  const rest = papers.slice(DIGEST_FULL_CARDS)

  const cards = full.map((p) => cardHtml(p, appUrl)).join('')
  const compact =
    rest.length > 0
      ? `<div style="margin-top:18px;"><div style="color:${C.muted};font:500 12px/1.4 ${MONO};letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;">More this week</div>
        <ul data-section="compact" style="list-style:none;margin:0;padding:0;">${rest.map((p) => compactItemHtml(p, appUrl)).join('')}</ul></div>`
      : ''

  const html = shell(`${masthead(range)}${cards}${compact}${footerHtml(appUrl)}`)

  const noun = papers.length === 1 ? 'paper' : 'papers'
  const subject = `ForensicFeed · ${papers.length} new ${noun} this week`
  const text = [
    `ForensicFeed · Weekly Digest`,
    range,
    '',
    ...papers.map((p) => paperText(p, appUrl)),
    '',
    `Browse all: ${appUrl}`,
  ].join('\n')

  return { subject, html, text }
}

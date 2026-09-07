import type { NormalisedPaper } from '@/types/paper'

// Storage invariants enforced on every adapter's output before it reaches the
// database. Both rules exist because Semantic Scholar's date-sorted bulk sweep
// returns rows the feed cannot usefully render:
//
//   no_pdf_url     A row with no open-access PDF is paywalled. A DOI does not
//                  rescue it — doi.org resolves to a publisher landing page, not
//                  a readable paper. Adapters that can synthesise a free PDF
//                  (e.g. from an arXiv id) must do so before this check.
//   paywalled_pdf  S2's `openAccessPdf` is not trustworthy: measured against the
//                  live corpus it returned doi.org redirects and gated publisher
//                  URLs that serve HTML login walls, not PDFs. Reject those by
//                  host rather than believing the field.
//   future_dated   Publishers assign issue dates months ahead, so S2 reports an
//                  October date for a paper posted in August. The feed sorts
//                  newest-first, so those rows pin to the top and never age off.
export type RejectionReason = 'no_pdf_url' | 'paywalled_pdf' | 'future_dated'

// Hosts that never serve a free, direct PDF. Listed as registrable domains and
// matched on a dot boundary, so `idp.nature.com` and `dl.acm.org` are covered by
// their parent entry while `notacm.org` is not. doi.org is here because it is a
// redirector — the destination is unknowable without following it, and following
// it at ingest time would mean an HTTP round-trip per paper.
const BLOCKED_PDF_HOSTS: readonly string[] = [
  'doi.org',
  'acm.org',
  'springer.com',
  'wiley.com',
  'oup.com',
  'nature.com',
  'ieee.org',
  'sciencedirect.com',
  'elsevier.com',
  'tandfonline.com',
  'degruyter.com',
  'degruyterbrill.com',
  'riverpublishers.com',
]

function servesFreePdf(pdfUrl: string): boolean {
  let host: string
  try {
    host = new URL(pdfUrl).hostname.toLowerCase()
  } catch {
    // An unparseable URL is not a link we can hand a reader.
    return false
  }
  return !BLOCKED_PDF_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`))
}

export type RejectionCounts = Record<RejectionReason, number>

export interface PartitionedPapers {
  accepted: NormalisedPaper[]
  rejected: RejectionCounts
}

export function rejectionReason(paper: NormalisedPaper, now: Date): RejectionReason | null {
  if (!paper.pdfUrl) return 'no_pdf_url'
  if (!servesFreePdf(paper.pdfUrl)) return 'paywalled_pdf'
  if (paper.publishedDate.getTime() > now.getTime()) return 'future_dated'
  return null
}

export function partitionStorablePapers(
  papers: readonly NormalisedPaper[],
  now: Date,
): PartitionedPapers {
  const accepted: NormalisedPaper[] = []
  const rejected: RejectionCounts = { no_pdf_url: 0, paywalled_pdf: 0, future_dated: 0 }

  for (const paper of papers) {
    const reason = rejectionReason(paper, now)
    if (reason === null) accepted.push(paper)
    else rejected[reason] += 1
  }

  return { accepted, rejected }
}

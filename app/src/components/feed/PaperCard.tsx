import type { Paper } from '@/lib/db/schema'

interface PaperCardProps {
  paper: Paper
}

function formatAuthors(authors: string[]): string {
  if (authors.length === 0) return 'Unknown authors'
  if (authors.length <= 3) return authors.join(', ')
  return `${authors.slice(0, 3).join(', ')} +${authors.length - 3}`
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(value)
}

const VENUE_TYPE_LABEL: Record<string, string> = {
  arxiv: 'arXiv',
  conference: 'Conference',
  workshop: 'Workshop',
  journal: 'Journal',
  preprint: 'Preprint',
}

function venueLabel(paper: Paper): string {
  if (paper.venue && paper.venue !== 'arXiv') return paper.venue
  return VENUE_TYPE_LABEL[paper.venueType] ?? paper.venueType
}

function formatRelevance(score: number): string {
  return `${Math.round(score * 100)}% match`
}

function formatCitations(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k citations`
  return `${count} ${count === 1 ? 'citation' : 'citations'}`
}

function resolvePaperHref(paper: Paper): string | null {
  if (paper.pdfUrl) return paper.pdfUrl
  if (paper.arxivId) return `https://arxiv.org/abs/${paper.arxivId}`
  return null
}

export function PaperCard({ paper }: PaperCardProps) {
  const href = resolvePaperHref(paper)
  const titleId = `paper-${paper.id}-title`
  const citationCount =
    typeof paper.citationCount === 'number' && paper.citationCount > 0
      ? paper.citationCount
      : null

  return (
    <article className="paper-card" aria-labelledby={titleId}>
      <div className="paper-card-meta">
        <span>{formatDate(paper.publishedDate)}</span>
        <span className="paper-card-meta-dot paper-card-score">
          <span className="sr-only">Relevance score: </span>
          {formatRelevance(paper.relevanceScore)}
        </span>
        {citationCount !== null ? (
          <span className="paper-card-meta-dot">{formatCitations(citationCount)}</span>
        ) : null}
      </div>
      <h2 className="paper-card-title" id={titleId}>
        {href ? (
          <a
            className="paper-card-title-link"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {paper.title}
            <span className="sr-only"> (opens in new tab)</span>
          </a>
        ) : (
          paper.title
        )}
      </h2>
      <p className="paper-card-authors">{formatAuthors(paper.authors)}</p>
      {paper.abstract ? <p className="paper-card-abstract">{paper.abstract}</p> : null}
      <div className="paper-card-footer">
        <span className="tag-badge tag-badge-venue">{venueLabel(paper)}</span>
        {paper.relevanceTags.slice(0, 4).map((tag) => (
          <span key={tag} className="tag-badge">
            {tag}
          </span>
        ))}
        {paper.codeUrl ? (
          <a
            className="tag-badge tag-badge-code"
            href={paper.codeUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span aria-hidden="true">{'</>'}</span>
            <span>code</span>
            <span className="sr-only"> (opens in new tab)</span>
          </a>
        ) : null}
      </div>
    </article>
  )
}

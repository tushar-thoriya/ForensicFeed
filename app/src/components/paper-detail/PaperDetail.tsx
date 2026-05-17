import Link from 'next/link'
import type { PaperWithUserState } from '@/types/paper'
import { SaveButton } from '@/components/paper-actions/SaveButton'
import { ReadToggle } from '@/components/paper-actions/ReadToggle'

interface PaperDetailProps {
  paper: PaperWithUserState
}

const VENUE_TYPE_LABEL: Record<string, string> = {
  arxiv: 'arXiv',
  conference: 'Conference',
  workshop: 'Workshop',
  journal: 'Journal',
  preprint: 'Preprint',
}

function venueLabel(paper: PaperWithUserState): string {
  if (paper.venue && paper.venue !== 'arXiv') return paper.venue
  return VENUE_TYPE_LABEL[paper.venueType] ?? paper.venueType
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(value)
}

function formatRelevance(score: number): string {
  return `${Math.round(score * 100)}% match`
}

function formatCitations(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k citations`
  return `${count} ${count === 1 ? 'citation' : 'citations'}`
}

function primaryLink(paper: PaperWithUserState): { href: string; label: string } | null {
  if (paper.pdfUrl) return { href: paper.pdfUrl, label: 'Open PDF' }
  if (paper.arxivId) {
    return { href: `https://arxiv.org/abs/${paper.arxivId}`, label: 'Open on arXiv' }
  }
  return null
}

export function PaperDetail({ paper }: PaperDetailProps) {
  const primary = primaryLink(paper)
  const citationCount =
    typeof paper.citationCount === 'number' && paper.citationCount > 0 ? paper.citationCount : null

  return (
    <article className="paper-detail">
      <div className="paper-detail-back">
        <Link href="/" className="paper-detail-back-link">
          ← Back to feed
        </Link>
      </div>

      <header className="paper-detail-header">
        <p className="paper-detail-meta">
          <span>{formatDate(paper.publishedDate)}</span>
          <span className="paper-detail-meta-dot">{venueLabel(paper)}</span>
          <span className="paper-detail-meta-dot paper-detail-meta-score">
            <span className="sr-only">Relevance score: </span>
            {formatRelevance(paper.relevanceScore)}
          </span>
          {citationCount !== null ? (
            <span className="paper-detail-meta-dot">{formatCitations(citationCount)}</span>
          ) : null}
        </p>
        <h1 className="paper-detail-title">{paper.title}</h1>
        <p className="paper-detail-authors">
          {paper.authors.length > 0 ? paper.authors.join(', ') : 'Unknown authors'}
        </p>
      </header>

      <div className="paper-detail-actions">
        {primary ? (
          <a
            className="paper-detail-cta"
            href={primary.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {primary.label}
            <span className="sr-only"> (opens in new tab)</span>
          </a>
        ) : null}
        <SaveButton paperId={paper.id} initialSaved={paper.isSaved} />
        <ReadToggle paperId={paper.id} initialRead={paper.isRead} />
        {paper.codeUrl ? (
          <a
            className="paper-detail-link"
            href={paper.codeUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View code
            <span className="sr-only"> (opens in new tab)</span>
          </a>
        ) : null}
      </div>

      {paper.abstract ? (
        <section className="paper-detail-abstract" aria-labelledby="abstract-heading">
          <h2 id="abstract-heading" className="paper-detail-section-title">
            Abstract
          </h2>
          <p className="paper-detail-abstract-body">{paper.abstract}</p>
        </section>
      ) : null}

      {paper.relevanceTags.length > 0 ? (
        <section className="paper-detail-tags" aria-labelledby="tags-heading">
          <h2 id="tags-heading" className="paper-detail-section-title">
            Topics
          </h2>
          <ul className="paper-detail-tag-list">
            {paper.relevanceTags.map((tag) => (
              <li key={tag} className="tag-badge">
                {tag}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="paper-detail-ids" aria-labelledby="ids-heading">
        <h2 id="ids-heading" className="paper-detail-section-title">
          Identifiers
        </h2>
        <dl className="paper-detail-ids-list">
          <div>
            <dt>Source</dt>
            <dd>{paper.primarySource}</dd>
          </div>
          {paper.arxivId ? (
            <div>
              <dt>arXiv</dt>
              <dd>{paper.arxivId}</dd>
            </div>
          ) : null}
          {paper.doi ? (
            <div>
              <dt>DOI</dt>
              <dd>{paper.doi}</dd>
            </div>
          ) : null}
          {paper.year ? (
            <div>
              <dt>Year</dt>
              <dd>{paper.year}</dd>
            </div>
          ) : null}
        </dl>
      </section>
    </article>
  )
}

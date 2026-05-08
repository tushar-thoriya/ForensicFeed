import type { Paper } from '@/lib/db/schema'
import { PaperCard } from './PaperCard'

interface PaperListProps {
  papers: Paper[]
}

export function PaperList({ papers }: PaperListProps) {
  if (papers.length === 0) {
    return (
      <div className="empty-state">
        <p>No papers yet. Trigger an ingest run to populate the feed.</p>
      </div>
    )
  }

  return (
    <ul className="feed-list">
      {papers.map((paper) => (
        <li key={paper.id}>
          <PaperCard paper={paper} />
        </li>
      ))}
    </ul>
  )
}

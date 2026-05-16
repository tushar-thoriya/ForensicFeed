import type { PaperWithHighlight } from '@/types/paper'
import { PaperCard } from './PaperCard'

interface PaperListProps {
  papers: PaperWithHighlight[]
}

// Callers must guard the empty case themselves and render <EmptyState/>
// with the appropriate variant — page.tsx does this. PaperList's only
// responsibility is laying out a non-empty list.
export function PaperList({ papers }: PaperListProps) {
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

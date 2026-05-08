import { listRecentPapers } from '@/lib/db/queries/papers'
import type { Paper } from '@/lib/db/schema'
import { PaperList } from '@/components/feed/PaperList'
import '@/components/feed/feed.css'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function FeedPage() {
  let papers: Paper[] = []
  let errorMessage: string | null = null

  try {
    papers = await listRecentPapers({ limit: 50, minRelevance: 0.2 })
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Failed to load papers'
  }

  return (
    <main className="feed-shell">
      <header className="feed-header">
        <h1 className="feed-title">ForensicFeed</h1>
        <p className="feed-subtitle">
          Open-access research on image forgery detection and localization — tracked so nothing
          slips past.
        </p>
        <p className="feed-meta">
          {errorMessage ? 'connection issue' : `${papers.length} papers · newest first`}
        </p>
      </header>
      {errorMessage ? (
        <div className="empty-state">
          <p>{errorMessage}</p>
        </div>
      ) : (
        <PaperList papers={papers} />
      )}
    </main>
  )
}

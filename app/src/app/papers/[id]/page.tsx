import { notFound } from 'next/navigation'
import { getPaperById } from '@/lib/db/queries/papers'
import { PaperDetail } from '@/components/paper-detail/PaperDetail'
import '@/components/paper-detail/paper-detail.css'
import '@/components/paper-actions/paper-actions.css'
import '@/components/feed/feed.css'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface PaperPageProps {
  params: Promise<{ id: string }>
}

export default async function PaperPage({ params }: PaperPageProps) {
  const { id } = await params

  let paper
  try {
    paper = await getPaperById(decodeURIComponent(id))
  } catch (error) {
    console.error('[PaperPage] getPaperById failed', error)
    return (
      <main>
        <div className="empty-state">
          <p>Failed to load paper.</p>
        </div>
      </main>
    )
  }

  if (!paper) notFound()

  return (
    <main>
      <PaperDetail paper={paper} />
    </main>
  )
}

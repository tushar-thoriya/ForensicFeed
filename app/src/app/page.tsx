import { Suspense } from 'react'
import { FilterChipsBar } from '@/components/filters/FilterChipsBar'
import { SearchInput } from '@/components/search/SearchInput'
import { FeedNav } from '@/components/nav/FeedNav'
import { DomainTabs } from '@/components/nav/DomainTabs'
import { parseFilterParams } from '@/lib/filters/parse'
import { type FilterState } from '@/types/filter'
import { loadFeedData } from '@/components/feed/feed-data'
import {
  FeedResultContext,
  FeedResultCount,
  FeedResults,
  FeedSidebar,
} from '@/components/feed/FeedSections'
import { FilterSidebarSkeleton, PaperListSkeleton } from '@/components/feed/FeedSkeletons'
import '@/components/feed/feed.css'
import '@/components/filters/filters.css'
import '@/components/search/search.css'
import '@/components/paper-actions/paper-actions.css'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RESULT_STATUS_ID = 'feed-result-status'

interface FeedPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function paramsToURLSearchParams(
  params: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const v of value) sp.append(key, v)
    } else {
      sp.append(key, value)
    }
  }
  return sp
}

const SUBTITLE: Record<FilterState['domain'], string> = {
  forgery:
    'Open-access research on image forgery detection and localization — tracked so nothing slips past.',
  deepfake:
    'Deepfake, face-swap, and synthetic-face detection research — tracked alongside the forgery feed.',
}

export default async function FeedPage({ searchParams }: FeedPageProps) {
  const resolved = await searchParams
  const filters: FilterState = parseFilterParams(paramsToURLSearchParams(resolved))

  // Kick off the (single, shared) fetch but DON'T await it here — the header
  // and tabs below render immediately, and each <Suspense> section awaits this
  // same promise so a tab switch updates the shell instantly while only the
  // sidebar/count/list stream in behind a skeleton.
  const dataPromise = loadFeedData(filters)

  return (
    <main className="feed-with-sidebar">
      <Suspense fallback={<FilterSidebarSkeleton />}>
        <FeedSidebar dataPromise={dataPromise} filters={filters} />
      </Suspense>
      <div>
        <header className="feed-header">
          <FeedNav current="feed" />
          <p className="feed-eyebrow">the feed</p>
          <h1 className="feed-title">ForensicFeed</h1>
          <p className="feed-subtitle">{SUBTITLE[filters.domain]}</p>
          <DomainTabs filters={filters} />
          <SearchInput initialValue={filters.searchQuery ?? ''} resultStatusId={RESULT_STATUS_ID} />
          <p id={RESULT_STATUS_ID} className="feed-meta">
            {/* Stable live region: only its text swaps from the fallback to the
                streamed count, so the total is announced once it resolves. */}
            <span aria-live="polite" role="status">
              <Suspense fallback={<>…</>}>
                <FeedResultCount dataPromise={dataPromise} filters={filters} />
              </Suspense>
            </span>
            <Suspense fallback={null}>
              <FeedResultContext dataPromise={dataPromise} filters={filters} />
            </Suspense>
          </p>
          <FilterChipsBar filters={filters} />
        </header>
        <Suspense fallback={<PaperListSkeleton />}>
          <FeedResults dataPromise={dataPromise} filters={filters} />
        </Suspense>
      </div>
    </main>
  )
}

'use client'

import Link, { useLinkStatus } from 'next/link'
import { serialiseFilters } from '@/lib/filters/parse'
import type { FilterState } from '@/types/filter'
import type { PaperDomain } from '@/types/paper'
import './domain-tabs.css'

interface DomainTabsProps {
  filters: FilterState
}

const TABS: ReadonlyArray<{ domain: PaperDomain; label: string }> = [
  { domain: 'forgery', label: 'Forgery & Localization' },
  { domain: 'deepfake', label: 'Deepfakes' },
]

// Switching tabs preserves every other filter/search term — they compose
// meaningfully across both domains. domain='forgery' serialises to no param,
// so the forgery tab's href is a clean '/' when no other filters are active.
function hrefForDomain(filters: FilterState, domain: PaperDomain): string {
  const qs = serialiseFilters({ ...filters, domain }).toString()
  return qs ? `/?${qs}` : '/'
}

// Rendered inside each <Link>; useLinkStatus reports the pending state of its
// nearest ancestor Link so the exact tab being navigated to shows a spinner
// immediately on click — instant feedback while the feed streams in behind it.
function TabPendingIndicator() {
  const { pending } = useLinkStatus()
  if (!pending) return null
  return <span className="domain-tab-spinner" aria-hidden="true" />
}

// URL-driven tabs: each is a real navigation to a query-param variant of the
// same route, so aria-current="page" (not role="tab"/aria-selected, which
// would imply in-page JS panel switching) is the correct semantic.
export function DomainTabs({ filters }: DomainTabsProps) {
  return (
    <nav className="domain-tabs" aria-label="Paper domain">
      {TABS.map((tab) => {
        const active = filters.domain === tab.domain
        return (
          <Link
            key={tab.domain}
            href={hrefForDomain(filters, tab.domain)}
            className={`domain-tab${active ? ' domain-tab-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {tab.label}
            <TabPendingIndicator />
          </Link>
        )
      })}
    </nav>
  )
}

'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useCallback } from 'react'
// FilterChips intentionally NOT rendered here — the page lives inside a
// 2-column grid (sidebar | content); the chips row must live in the right
// column above the paper list, not as a sibling of the sidebar, otherwise
// it claims a grid cell and bumps the main content into the wrong row.
import { FilterSidebar } from './FilterSidebar'
import { FilterSheet } from './FilterSheet'
import { serialiseFilters } from '@/lib/filters/parse'
import { type FilterState } from '@/types/filter'
import type { PaperSource, VenueType } from '@/types/paper'

interface FilterPanelProps {
  filters: FilterState
  availableSources: ReadonlyArray<PaperSource>
  availableVenueTypes: ReadonlyArray<VenueType>
  availableYears: ReadonlyArray<number>
}

export function FilterPanel({
  filters,
  availableSources,
  availableVenueTypes,
  availableYears,
}: FilterPanelProps) {
  const router = useRouter()
  const pathname = usePathname()

  const navigate = useCallback(
    (next: FilterState) => {
      const query = serialiseFilters(next).toString()
      const url = query ? `${pathname}?${query}` : pathname
      router.push(url, { scroll: false })
    },
    [pathname, router],
  )

  const sidebarProps = {
    filters,
    availableSources,
    availableVenueTypes,
    availableYears,
    onChange: navigate,
  } as const

  return (
    <>
      <FilterSheet triggerLabel="Filters">
        <FilterSidebar {...sidebarProps} showHeading={false} />
      </FilterSheet>
      <FilterSidebar {...sidebarProps} />
    </>
  )
}

'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import { FilterChips } from './FilterChips'
import { FilterSidebar } from './FilterSidebar'
import { FilterSheet } from './FilterSheet'
import { serialiseFilters } from '@/lib/filters/parse'
import { EMPTY_FILTERS, type FilterState, type RemoveFilterArgs } from '@/types/filter'
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

  const onRemove = useCallback(
    (args: RemoveFilterArgs) => {
      switch (args.dimension) {
        case 'source':
          navigate({ ...filters, sources: filters.sources.filter((v) => v !== args.value) })
          return
        case 'venueType':
          navigate({
            ...filters,
            venueTypes: filters.venueTypes.filter((v) => v !== args.value),
          })
          return
        case 'year':
          navigate({ ...filters, years: filters.years.filter((v) => v !== args.value) })
          return
        case 'tag':
          navigate({ ...filters, tags: filters.tags.filter((v) => v !== args.value) })
          return
        case 'hasCode':
          navigate({ ...filters, hasCode: null })
          return
      }
    },
    [filters, navigate],
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
      <FilterChips
        filters={filters}
        onRemove={onRemove}
        onClearAll={() => navigate(EMPTY_FILTERS)}
      />
    </>
  )
}

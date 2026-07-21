'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import { FilterChips } from './FilterChips'
import { serialiseFilters } from '@/lib/filters/parse'
import { EMPTY_FILTERS, type FilterState, type RemoveFilterArgs } from '@/types/filter'

interface FilterChipsBarProps {
  filters: FilterState
}

export function FilterChipsBar({ filters }: FilterChipsBarProps) {
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

  return (
    <FilterChips
      filters={filters}
      onRemove={onRemove}
      onClearAll={() => navigate({ ...EMPTY_FILTERS, domain: filters.domain })}
    />
  )
}

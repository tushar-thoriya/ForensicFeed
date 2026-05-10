'use client'

import { useMemo } from 'react'
import { TAG_ORDER, type Tag } from '@/lib/ingestion/tagger'
import { SOURCE_LABEL, TAG_LABEL, VENUE_TYPE_LABEL } from '@/lib/filters/labels'
import { EMPTY_FILTERS, type FilterState, type SortBy } from '@/types/filter'
import type { PaperSource, VenueType } from '@/types/paper'

const SORT_OPTIONS: ReadonlyArray<{ value: SortBy; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'relevance', label: 'Most relevant' },
]

const HAS_CODE_OPTIONS: ReadonlyArray<{ value: 'any' | 'yes' | 'no'; label: string }> = [
  { value: 'any', label: 'Any' },
  { value: 'yes', label: 'With code' },
  { value: 'no', label: 'Without code' },
]

interface FilterSidebarProps {
  filters: FilterState
  availableSources: ReadonlyArray<PaperSource>
  availableVenueTypes: ReadonlyArray<VenueType>
  availableYears: ReadonlyArray<number>
  availableTags?: ReadonlyArray<Tag>
  onChange: (next: FilterState) => void
  showHeading?: boolean
}

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]
}

export function FilterSidebar({
  filters,
  availableSources,
  availableVenueTypes,
  availableYears,
  availableTags = TAG_ORDER,
  onChange,
  showHeading = true,
}: FilterSidebarProps) {
  const hasCodeValue: 'any' | 'yes' | 'no' =
    filters.hasCode === true ? 'yes' : filters.hasCode === false ? 'no' : 'any'

  const sortedYears = useMemo(() => [...availableYears].sort((a, b) => b - a), [availableYears])

  return (
    <aside
      className="filter-sidebar"
      {...(showHeading ? { 'aria-label': 'Filters' } : { 'aria-hidden': 'true' as const })}
    >
      {showHeading && <h2 className="filter-sidebar-title">Filters</h2>}

      <fieldset className="filter-section">
        <legend className="filter-section-legend">Sort by</legend>
        <div className="filter-radio-group">
          {SORT_OPTIONS.map((opt) => (
            <label key={opt.value} className="filter-radio-label">
              <input
                type="radio"
                name="sort"
                value={opt.value}
                checked={filters.sortBy === opt.value}
                onChange={() => onChange({ ...filters, sortBy: opt.value })}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {availableSources.length > 0 && (
        <fieldset className="filter-section">
          <legend className="filter-section-legend">Source</legend>
          <div className="filter-checkbox-group">
            {availableSources.map((src) => (
              <label key={src} className="filter-checkbox-label">
                <input
                  type="checkbox"
                  checked={filters.sources.includes(src)}
                  onChange={() => onChange({ ...filters, sources: toggle(filters.sources, src) })}
                />
                <span>{SOURCE_LABEL[src]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {availableVenueTypes.length > 0 && (
        <fieldset className="filter-section">
          <legend className="filter-section-legend">Venue type</legend>
          <div className="filter-checkbox-group">
            {availableVenueTypes.map((vt) => (
              <label key={vt} className="filter-checkbox-label">
                <input
                  type="checkbox"
                  checked={filters.venueTypes.includes(vt)}
                  onChange={() =>
                    onChange({ ...filters, venueTypes: toggle(filters.venueTypes, vt) })
                  }
                />
                <span>{VENUE_TYPE_LABEL[vt]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {sortedYears.length > 0 && (
        <fieldset className="filter-section">
          <legend className="filter-section-legend">Year</legend>
          <div className="filter-checkbox-group filter-checkbox-group-inline">
            {sortedYears.map((y) => (
              <label key={y} className="filter-checkbox-label" aria-label={`Year ${y}`}>
                <input
                  type="checkbox"
                  checked={filters.years.includes(y)}
                  onChange={() => onChange({ ...filters, years: toggle(filters.years, y) })}
                />
                <span>{y}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="filter-section">
        <legend className="filter-section-legend">Topic</legend>
        <div className="filter-checkbox-group">
          {availableTags.map((tag) => (
            <label key={tag} className="filter-checkbox-label">
              <input
                type="checkbox"
                checked={filters.tags.includes(tag)}
                onChange={() => onChange({ ...filters, tags: toggle(filters.tags, tag) })}
              />
              <span>{TAG_LABEL[tag]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="filter-section">
        <legend className="filter-section-legend">Code availability</legend>
        <div className="filter-radio-group">
          {HAS_CODE_OPTIONS.map((opt) => (
            <label key={opt.value} className="filter-radio-label">
              <input
                type="radio"
                name="hasCode"
                value={opt.value}
                checked={hasCodeValue === opt.value}
                onChange={() =>
                  onChange({
                    ...filters,
                    hasCode: opt.value === 'yes' ? true : opt.value === 'no' ? false : null,
                  })
                }
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        className="filter-clear-button"
        onClick={() => onChange(EMPTY_FILTERS)}
      >
        Clear all filters
      </button>
    </aside>
  )
}

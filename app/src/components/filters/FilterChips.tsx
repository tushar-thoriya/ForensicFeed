'use client'

import { SOURCE_LABEL, TAG_LABEL, VENUE_TYPE_LABEL } from '@/lib/filters/labels'
import type { FilterState, RemoveFilterArgs } from '@/types/filter'

interface ChipDef {
  key: string
  label: string
  args: RemoveFilterArgs
}

function buildChips(filters: FilterState): ChipDef[] {
  const chips: ChipDef[] = []

  for (const value of filters.sources) {
    chips.push({
      key: `source:${value}`,
      label: `Source · ${SOURCE_LABEL[value]}`,
      args: { dimension: 'source', value },
    })
  }
  for (const value of filters.venueTypes) {
    chips.push({
      key: `venueType:${value}`,
      label: `Venue · ${VENUE_TYPE_LABEL[value]}`,
      args: { dimension: 'venueType', value },
    })
  }
  for (const value of filters.years) {
    chips.push({
      key: `year:${value}`,
      label: `Year · ${value}`,
      args: { dimension: 'year', value },
    })
  }
  for (const value of filters.tags) {
    chips.push({
      key: `tag:${value}`,
      label: `Tag · ${TAG_LABEL[value]}`,
      args: { dimension: 'tag', value },
    })
  }
  if (filters.hasCode === true) {
    chips.push({
      key: 'hasCode:true',
      label: 'Has code',
      args: { dimension: 'hasCode', value: null },
    })
  } else if (filters.hasCode === false) {
    chips.push({
      key: 'hasCode:false',
      label: 'No code',
      args: { dimension: 'hasCode', value: null },
    })
  }
  return chips
}

interface FilterChipsProps {
  filters: FilterState
  onRemove: (args: RemoveFilterArgs) => void
  onClearAll: () => void
}

export function FilterChips({ filters, onRemove, onClearAll }: FilterChipsProps) {
  const chips = buildChips(filters)
  if (chips.length === 0) return null

  return (
    <div className="filter-chips" role="group" aria-label="Active filters">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className="filter-chip"
          onClick={() => onRemove(chip.args)}
          aria-label={`Remove filter ${chip.label}`}
        >
          <span>{chip.label}</span>
          <span aria-hidden="true" className="filter-chip-x">
            ×
          </span>
        </button>
      ))}
      {chips.length >= 2 && (
        <button type="button" className="filter-chip-clear" onClick={onClearAll}>
          Clear all
        </button>
      )}
    </div>
  )
}

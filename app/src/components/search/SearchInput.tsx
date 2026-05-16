'use client'

import { useEffect, useRef, useState, useId } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { parseFilterParams, serialiseFilters } from '@/lib/filters/parse'
import { parseSearchQuery } from '@/lib/search/parse-query'

const DEBOUNCE_MS = 300

interface SearchInputProps {
  initialValue: string
  resultStatusId?: string
}

export function SearchInput({ initialValue, resultStatusId }: SearchInputProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(initialValue)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputId = useId()

  // Sync local state when the URL changes via back/forward or a Link click.
  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  function navigate(nextValue: string | null, kind: 'replace' | 'push') {
    // Read current params from Next.js's source-of-truth, not window.location —
    // App Router updates this on every nav before the next render, so this
    // stays consistent even if two navigations queue up.
    const currentParams = new URLSearchParams(searchParams.toString())
    const current = parseFilterParams(currentParams)
    const next = { ...current, searchQuery: parseSearchQuery(nextValue) }
    const serialised = serialiseFilters(next).toString()
    const href = serialised.length === 0 ? '/' : `/?${serialised}`
    if (kind === 'push') router.push(href, { scroll: false })
    else router.replace(href, { scroll: false })
  }

  function cancelDebounce() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    setValue(next)
    cancelDebounce()
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      navigate(next, 'replace')
    }, DEBOUNCE_MS)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      // CRITICAL: clear the debounce BEFORE pushing, otherwise a queued
      // timer can fire after the push and silently overwrite the just-
      // created history entry with a replace.
      cancelDebounce()
      navigate(value, 'push')
      return
    }
    if (e.key === 'Escape' && value.length > 0) {
      e.preventDefault()
      cancelDebounce()
      setValue('')
      navigate(null, 'push')
    }
  }

  function handleClear() {
    cancelDebounce()
    setValue('')
    navigate(null, 'push')
  }

  return (
    <form
      className="search-input"
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        cancelDebounce()
        navigate(value, 'push')
      }}
    >
      <label htmlFor={inputId} className="search-input-label">
        Search papers
      </label>
      <div className="search-input-row">
        <input
          id={inputId}
          type="search"
          className="search-input-field"
          placeholder="Search title and abstract…"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-describedby={resultStatusId}
          autoComplete="off"
          spellCheck="false"
          enterKeyHint="search"
        />
        {value.length > 0 ? (
          <button
            type="button"
            className="search-input-clear"
            onClick={handleClear}
            aria-label="Clear search"
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>
    </form>
  )
}

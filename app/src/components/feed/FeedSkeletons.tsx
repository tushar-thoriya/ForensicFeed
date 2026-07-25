import './feed-skeleton.css'

const LIST_ROWS = ['a', 'b', 'c', 'd', 'e'] as const
const SIDEBAR_GROUPS = ['sort', 'source', 'venue', 'year'] as const

// Placeholder shown while the paper list streams in. aria-hidden so screen
// readers wait for the real result count in the live region rather than
// announcing decorative placeholders.
export function PaperListSkeleton() {
  return (
    <ul className="feed-list" aria-hidden="true">
      {LIST_ROWS.map((key) => (
        <li key={key} className="paper-skeleton">
          <div className="skeleton-line skeleton-meta" />
          <div className="skeleton-line skeleton-title" />
          <div className="skeleton-line skeleton-title short" />
          <div className="skeleton-line skeleton-text" />
          <div className="skeleton-line skeleton-text" />
          <div className="skeleton-line skeleton-text short" />
          <div className="skeleton-tags">
            <span className="skeleton-chip" />
            <span className="skeleton-chip" />
            <span className="skeleton-chip" />
          </div>
        </li>
      ))}
    </ul>
  )
}

// Desktop sidebar placeholder. Reuses `.filter-sidebar` so it inherits the
// same 1100px visibility gate and sticky column as the real panel.
export function FilterSidebarSkeleton() {
  return (
    <aside className="filter-sidebar" aria-hidden="true">
      <div className="skeleton-line skeleton-sidebar-title" />
      {SIDEBAR_GROUPS.map((key) => (
        <div key={key} className="skeleton-group">
          <div className="skeleton-line skeleton-sidebar-label" />
          <div className="skeleton-line skeleton-sidebar-option" />
          <div className="skeleton-line skeleton-sidebar-option" />
        </div>
      ))}
    </aside>
  )
}

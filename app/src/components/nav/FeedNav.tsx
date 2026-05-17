import Link from 'next/link'
import './feed-nav.css'

interface FeedNavProps {
  current: 'feed' | 'saved'
}

// Two-link nav rendered at the top of /  and /saved. Active link gets
// aria-current="page" for screen readers and a visual underline.
// Intentionally minimal — no client-side state, no router awareness; the
// active route is passed in by the page component.
export function FeedNav({ current }: FeedNavProps) {
  return (
    <nav className="feed-nav" aria-label="Primary">
      <Link
        href="/"
        className={`feed-nav-link${current === 'feed' ? ' feed-nav-link-active' : ''}`}
        aria-current={current === 'feed' ? 'page' : undefined}
      >
        Feed
      </Link>
      <Link
        href="/saved"
        className={`feed-nav-link${current === 'saved' ? ' feed-nav-link-active' : ''}`}
        aria-current={current === 'saved' ? 'page' : undefined}
      >
        Saved
      </Link>
    </nav>
  )
}

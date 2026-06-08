import type { ReactNode } from 'react'

interface StatusScreenProps {
  eyebrow: string
  title: string
  message: string
  children?: ReactNode
}

export function StatusScreen({ eyebrow, title, message, children }: StatusScreenProps) {
  return (
    <main className="status-screen">
      <div className="status-screen-inner">
        <p className="status-screen-eyebrow">{eyebrow}</p>
        <h1 className="status-screen-title">{title}</h1>
        <p className="status-screen-message">{message}</p>
        {children && <div className="status-screen-actions">{children}</div>}
      </div>
    </main>
  )
}

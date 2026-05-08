import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import '@/styles/global.css'

export const metadata: Metadata = {
  title: 'ForensicFeed — Image forgery detection research',
  description:
    'Open-access research on image forgery detection and localization — tracked so nothing slips past.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

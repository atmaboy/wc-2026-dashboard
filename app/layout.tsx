import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FIFA World Cup 2026 | Live Dashboard',
  description: 'Live scoring dashboard for FIFA World Cup 2026',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

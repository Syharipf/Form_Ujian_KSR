import type { Metadata, Viewport } from 'next'
import './globals.css'

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
}

export const metadata: Metadata = {
  title: 'Ujian KSR PMI Telkom',
  description: 'Pre-test dan post-test KSR PMI Telkom',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="id">
      <body className="min-h-dvh bg-page text-fg antialiased">{children}</body>
    </html>
  )
}

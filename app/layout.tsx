import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ujian KSR PMI Telkom',
  description: 'Pre-test dan post-test KSR PMI Telkom',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="id">
      <body className="min-h-dvh bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  )
}

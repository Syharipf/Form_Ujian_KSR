import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { themeScript } from '@/lib/theme'
import './globals.css'

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' })

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
}

export const metadata: Metadata = {
  title: 'UjiKSR',
  description: 'Pre-test dan post-test KSR PMI Unit Universitas Telkom',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // suppressHydrationWarning: themeScript may set data-theme before React hydrates.
    <html lang="id" suppressHydrationWarning className={jakarta.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-page text-fg antialiased">
        {/* Shown only where globals.css says the browser is below Next.js' baseline (Chrome 111 / Safari 16.4). */}
        <p className="old-browser-note" style={{ margin: 0, padding: 12, background: '#fef3c7', color: '#111', textAlign: 'center', fontSize: 14 }}>
          Browser ini terlalu lama, ujian mungkin tidak berjalan. Perbarui Chrome/Safari, atau pakai HP lain.
        </p>
        {children}
      </body>
    </html>
  )
}

import Link from 'next/link'
import Brand from '@/app/brand'
import ThemeToggle from '@/app/theme-toggle'

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <>
      <div className="border-b border-line bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/admin" aria-label="Beranda admin" className="min-w-0">
            <Brand subtitle="Panel panitia · KSR PMI Universitas Telkom" />
          </Link>
          <ThemeToggle />
        </div>
      </div>
      {children}
    </>
  )
}

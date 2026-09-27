import ThemeToggle from '@/app/theme-toggle'

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <>
      <div className="mx-auto flex max-w-4xl justify-end px-4 pt-3">
        <ThemeToggle />
      </div>
      {children}
    </>
  )
}

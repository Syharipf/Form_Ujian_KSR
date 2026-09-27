import Image from 'next/image'

// Logo + app name, used at the top of every page.
export default function Brand({ subtitle = 'KSR PMI Universitas Telkom' }: Readonly<{ subtitle?: string }>) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Image src="/logo.png" alt="Logo PMI" width={40} height={40} priority className="size-10 shrink-0 rounded-full bg-white ring-1 ring-line" />
      <div className="min-w-0 leading-tight">
        <p className="text-lg font-extrabold tracking-tight">
          Uji<span className="text-primary">KSR</span>
        </p>
        <p className="truncate text-xs text-muted">{subtitle}</p>
      </div>
    </div>
  )
}

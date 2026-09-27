import { redirect } from 'next/navigation'
import Brand from './brand'
import SubmitButton from './submit-button'
import ThemeToggle from './theme-toggle'

async function open(formData: FormData) {
  'use server'
  const code = String(formData.get('code') ?? '').trim().toUpperCase()
  if (code) redirect(`/s/${encodeURIComponent(code)}`)
}

const STEPS = ['Scan QR atau masukkan kode dari panitia', 'Isi nama lengkap dan NIM', 'Kerjakan dalam layar penuh sampai selesai']

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-8 p-5">
      <header className="flex items-center justify-between gap-3">
        <Brand />
        <ThemeToggle compact />
      </header>

      <div className="my-auto space-y-6">
        <div className="space-y-2">
          <span className="badge bg-danger-soft text-danger">Pre-test &amp; Post-test</span>
          <h1 className="text-3xl font-extrabold tracking-tight text-balance">Siap uji pengetahuan kepalangmerahanmu?</h1>
        </div>

        <form action={open} className="card space-y-3 p-4">
          <label htmlFor="code" className="text-sm font-semibold">
            Kode sesi
          </label>
          <div className="flex gap-2">
            <input
              id="code"
              name="code"
              required
              maxLength={10}
              placeholder="Contoh: AB12CD"
              autoCapitalize="characters"
              autoComplete="off"
              className="field min-w-0 flex-1 font-semibold uppercase tracking-widest placeholder:font-normal placeholder:normal-case placeholder:tracking-normal"
            />
            <SubmitButton className="btn btn-primary">Masuk</SubmitButton>
          </div>
        </form>

        <ol className="space-y-3 text-sm text-secondary">
          {STEPS.map((step, i) => (
            <li key={step} className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-subtle text-xs font-bold text-fg">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </main>
  )
}

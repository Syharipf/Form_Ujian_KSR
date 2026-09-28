'use client'

import { useState, useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Session } from '@/lib/exam'
import { PendingLabel } from '@/app/pending'
import Brand from '@/app/brand'
import ThemeToggle from '@/app/theme-toggle'
import { enterFullscreen, exitFullscreen } from '@/lib/fullscreen'
import ResultLink from './result-link'

type Props = {
  host: string // typed by hand in an incognito tab, where a scanned QR doesn't open
  session: Pick<Session, 'code' | 'title' | 'kind' | 'timer_mode' | 'duration_sec' | 'per_question_sec' | 'max_violations'>
}

const noSubscribe = () => () => {}
function stored(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export default function JoinForm({ host, session }: Props) {
  const router = useRouter()
  const key = `attempt:${session.code}`
  const existing = useSyncExternalStore(noSubscribe, () => stored(key), () => null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false) // stays true through the navigation to the exam
  const [resuming, startResume] = useTransition()

  function resume() {
    enterFullscreen()
    startResume(() => router.push(`/exam/${existing}`))
  }

  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    enterFullscreen() // must run inside the tap that submitted the form
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: session.code, name: form.get('name'), nim: form.get('nim') }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Gagal memulai ujian')
      try {
        localStorage.setItem(key, body.id)
        sessionStorage.setItem(`fresh:${body.id}`, '1')
      } catch {}
      router.push(`/exam/${body.id}`)
    } catch (err) {
      exitFullscreen()
      setBusy(false)
      setError(err instanceof TypeError ? 'Koneksi bermasalah, coba lagi' : (err as Error).message)
    }
  }

  const timer =
    session.timer_mode === 'per_question'
      ? `${session.per_question_sec} detik per soal, tidak bisa kembali ke soal sebelumnya`
      : `${session.duration_sec / 60} menit untuk semua soal`

  return (
    <main className="mx-auto max-w-md space-y-6 p-5 pb-10">
      <header className="flex items-center justify-between gap-3">
        <Brand />
        <ThemeToggle compact />
      </header>

      <div className="space-y-2">
        <span className="badge bg-primary-soft text-primary">{session.kind === 'pre' ? 'Pre-test' : 'Post-test'}</span>
        <h1 className="text-2xl font-extrabold tracking-tight text-balance">{session.title}</h1>
      </div>

      <section className="card p-4 text-sm">
        <h2 className="mb-3 font-bold">Aturan ujian</h2>
        <ul className="space-y-3">
          <Rule icon="clock">Waktu: {timer}.</Rule>
          <Rule icon="bell">
            Aktifkan mode <b>Jangan Ganggu</b> dan tutup aplikasi lain sebelum mulai.
          </Rule>
          <Rule icon="screen">
            Ujian berjalan dalam layar penuh. Pindah aplikasi/tab, membuka notifikasi, split screen, keluar layar penuh, atau menutup
            browser dihitung pelanggaran.
          </Rule>
          <Rule icon="alert">Pelanggaran ke-{session.max_violations} membuat jawabanmu otomatis dikumpulkan.</Rule>
          <Rule icon="globe">
            Buka link ini di <b>Chrome</b> (Android) atau <b>Safari</b> (iPhone), bukan dari dalam aplikasi Instagram/LINE/TikTok.
          </Rule>
          <Rule icon="incognito">
            HP Android: kerjakan di <b>tab Samaran</b> Chrome (⋮ → Tab samaran baru, ketik <b>{host}</b>, masukkan kode <b>{session.code}</b>),
            supaya layar ujian tidak bisa direkam atau dibagikan ke aplikasi lain seperti Gemini.
          </Rule>
        </ul>
      </section>

      <ResultLink code={session.code} />

      {existing ? (
        <button onClick={resume} disabled={resuming} aria-busy={resuming} className="btn btn-primary w-full">
          <PendingLabel pending={resuming}>Lanjutkan ujian</PendingLabel>
        </button>
      ) : (
        <form onSubmit={start} className="card space-y-4 p-4">
          <label className="grid gap-1.5 text-sm font-semibold">
            <span>Nama lengkap</span>
            <input name="name" required maxLength={100} autoComplete="name" className="field font-normal" />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            <span>NIM</span>
            <input name="nim" required maxLength={30} autoComplete="off" className="field font-normal" />
          </label>
          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} aria-busy={busy} className="btn btn-primary w-full">
            <PendingLabel pending={busy}>Mulai ujian</PendingLabel>
          </button>
        </form>
      )}
    </main>
  )
}

const ICONS = {
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  bell: <path d="M8.7 3A6 6 0 0 1 18 8c0 3 .5 5 1.3 6.5M6 8c0 7-3 9-3 9h14M10.3 21a1.9 1.9 0 0 0 3.4 0M2 2l20 20" />,
  screen: <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />,
  alert: <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  incognito: <><path d="M2 11h20M5 11l2.2-6.2A1.2 1.2 0 0 1 8.3 4h7.4a1.2 1.2 0 0 1 1.1.8L19 11M10 18a2 2 0 0 1 4 0" /><circle cx="7" cy="18" r="3" /><circle cx="17" cy="18" r="3" /></>,
}

function Rule({ icon, children }: Readonly<{ icon: keyof typeof ICONS; children: React.ReactNode }>) {
  return (
    <li className="flex gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {ICONS[icon]}
        </svg>
      </span>
      <span className="pt-1.5 text-secondary">{children}</span>
    </li>
  )
}

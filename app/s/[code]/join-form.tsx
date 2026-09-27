'use client'

import { useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import type { Session } from '@/lib/exam'
import { enterFullscreen, exitFullscreen } from '@/lib/fullscreen'

type Props = {
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

export default function JoinForm({ session }: Props) {
  const router = useRouter()
  const key = `attempt:${session.code}`
  const existing = useSyncExternalStore(noSubscribe, () => stored(key), () => null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function resume() {
    enterFullscreen()
    router.push(`/exam/${existing}`)
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
    <main className="mx-auto max-w-md space-y-5 p-5">
      <header>
        <p className="text-sm font-semibold text-danger">KSR PMI Telkom · {session.kind === 'pre' ? 'Pre-test' : 'Post-test'}</p>
        <h1 className="text-2xl font-bold">{session.title}</h1>
      </header>

      <section className="rounded-lg border border-line bg-surface p-4 text-sm">
        <h2 className="mb-2 font-semibold">Aturan ujian</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Waktu: {timer}.</li>
          <li>
            Aktifkan mode <b>Jangan Ganggu</b> dan tutup aplikasi lain sebelum mulai.
          </li>
          <li>
            Ujian berjalan dalam layar penuh. Pindah aplikasi/tab, membuka notifikasi, split screen, keluar layar penuh, atau menutup
            browser dihitung pelanggaran.
          </li>
          <li>Pelanggaran ke-{session.max_violations} membuat jawabanmu otomatis dikumpulkan.</li>
        </ul>
      </section>

      {existing ? (
        <button onClick={resume} className="w-full rounded bg-red-600 p-3 font-semibold text-white">
          Lanjutkan ujian
        </button>
      ) : (
        <form onSubmit={start} className="space-y-3">
          <label className="grid gap-1 text-sm">
            Nama lengkap
            <input name="name" required maxLength={100} autoComplete="name" className="rounded border border-line-strong p-3 text-base" />
          </label>
          <label className="grid gap-1 text-sm">
            NIM
            <input name="nim" required maxLength={30} className="rounded border border-line-strong p-3 text-base" />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button disabled={busy} className="w-full rounded bg-red-600 p-3 font-semibold text-white disabled:opacity-50">
            {busy ? 'Memulai…' : 'Mulai ujian'}
          </button>
        </form>
      )}
    </main>
  )
}

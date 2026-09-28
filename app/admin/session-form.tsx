'use client'

import { useState } from 'react'
import SubmitButton from '@/app/submit-button'
import type { Session, TimerMode } from '@/lib/exam'

const input = 'field font-normal'

export default function SessionForm({
  action,
  session,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>
  session?: Session
  submitLabel: string
}) {
  // Only the chosen mode's time can be filled. A disabled field isn't submitted, so the server
  // keeps its stored (or default) value.
  const initialMode = session?.timer_mode ?? 'per_question'
  const [mode, setMode] = useState<TimerMode>(initialMode)
  return (
    <form action={action} onReset={() => setMode(initialMode)} className="grid gap-4 text-sm font-semibold sm:grid-cols-2">
      <label className="grid gap-1.5 sm:col-span-2">
        Judul
        <input name="title" required maxLength={120} defaultValue={session?.title} placeholder="Pre-test Diklat KSR 2026" className={input} />
      </label>
      <label className="grid gap-1.5 sm:col-span-2">
        Tanggal sesi
        {/* sv-SE formats as YYYY-MM-DD, the value <input type="date"> expects */}
        <input
          type="date"
          name="held_on"
          required
          defaultValue={session?.held_on ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })}
          className={input}
        />
      </label>
      <label className="grid gap-1.5">
        Jenis
        <select name="kind" defaultValue={session?.kind ?? 'pre'} className={input}>
          <option value="pre">Pre-test</option>
          <option value="post">Post-test</option>
        </select>
      </label>
      <label className="grid gap-1.5">
        Mode timer
        <select name="timer_mode" defaultValue={initialMode} onChange={(e) => setMode(e.target.value as TimerMode)} className={input}>
          <option value="per_question">Per soal (tidak bisa kembali)</option>
          <option value="total">Total (bebas bolak-balik)</option>
        </select>
      </label>
      <label className={`grid gap-1.5 ${mode === 'total' ? '' : 'text-muted'}`}>
        Durasi total, menit (mode total)
        <input
          type="number"
          name="duration_min"
          min={1}
          max={600}
          required
          disabled={mode !== 'total'}
          defaultValue={session ? session.duration_sec / 60 : 30}
          className={input}
        />
      </label>
      <label className={`grid gap-1.5 ${mode === 'per_question' ? '' : 'text-muted'}`}>
        Waktu per soal, detik (mode per soal)
        <input
          type="number"
          name="per_question_sec"
          min={5}
          max={600}
          required
          disabled={mode !== 'per_question'}
          defaultValue={session?.per_question_sec ?? 45}
          className={input}
        />
      </label>
      <label className="grid gap-1.5">
        Batas pelanggaran (auto-submit)
        <input type="number" name="max_violations" min={1} max={20} required defaultValue={session?.max_violations ?? 3} className={input} />
      </label>
      <div className="flex items-end">
        <SubmitButton className="btn btn-primary w-full">{submitLabel}</SubmitButton>
      </div>
    </form>
  )
}

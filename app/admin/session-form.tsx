import SubmitButton from '@/app/submit-button'
import type { Session } from '@/lib/exam'

const input = 'rounded border border-line-strong bg-surface p-2'

export default function SessionForm({
  action,
  session,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>
  session?: Session
  submitLabel: string
}) {
  return (
    <form action={action} className="grid gap-3 text-sm sm:grid-cols-2">
      <label className="grid gap-1 sm:col-span-2">
        Judul
        <input name="title" required maxLength={120} defaultValue={session?.title} placeholder="Pre-test Diklat KSR 2026" className={input} />
      </label>
      <label className="grid gap-1 sm:col-span-2">
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
      <label className="grid gap-1">
        Jenis
        <select name="kind" defaultValue={session?.kind ?? 'pre'} className={input}>
          <option value="pre">Pre-test</option>
          <option value="post">Post-test</option>
        </select>
      </label>
      <label className="grid gap-1">
        Mode timer
        <select name="timer_mode" defaultValue={session?.timer_mode ?? 'per_question'} className={input}>
          <option value="per_question">Per soal (tidak bisa kembali)</option>
          <option value="total">Total (bebas bolak-balik)</option>
        </select>
      </label>
      <label className="grid gap-1">
        Durasi total, menit (mode total)
        <input type="number" name="duration_min" min={1} max={600} required defaultValue={session ? session.duration_sec / 60 : 30} className={input} />
      </label>
      <label className="grid gap-1">
        Waktu per soal, detik (mode per soal)
        <input type="number" name="per_question_sec" min={5} max={600} required defaultValue={session?.per_question_sec ?? 45} className={input} />
      </label>
      <label className="grid gap-1">
        Batas pelanggaran (auto-submit)
        <input type="number" name="max_violations" min={1} max={20} required defaultValue={session?.max_violations ?? 3} className={input} />
      </label>
      <div className="flex items-end">
        <SubmitButton className="w-full rounded bg-red-600 p-2 font-semibold text-white">{submitLabel}</SubmitButton>
      </div>
    </form>
  )
}

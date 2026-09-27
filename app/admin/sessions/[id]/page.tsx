import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { requireAdmin } from '@/lib/admin-auth'
import { finalizeExpired } from '@/lib/attempts'
import { db, must } from '@/lib/db'
import type { Attempt, Question, Session } from '@/lib/exam'
import { deleteQuestion, resetAllAttempts, resetAttempt, saveQuestion, setOpen, updateSession, uploadQuestions } from '../../actions'
import ConfirmButton from '../../confirm-button'
import QuestionForm from '../../question-form'
import SessionForm from '../../session-form'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const STATUS = { manual: 'Selesai', timeout: 'Waktu habis', violation: 'Auto-submit (pelanggaran)' } as const
const VIOLATION: Record<string, string> = {
  hidden: 'pindah aplikasi/tab',
  blur: 'hilang fokus',
  fullscreen_exit: 'keluar layar penuh',
  resize: 'layar mengecil (split screen)',
  reopen: 'membuka ulang ujian',
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' })

type Violation = { id: string; attempt_id: string; type: string; created_at: string }

export default async function SessionAdminPage(props: PageProps<'/admin/sessions/[id]'>) {
  await requireAdmin()
  const { id } = await props.params
  const { msg } = await props.searchParams
  if (!UUID.test(id)) notFound()
  const session: Session | null = must(await db().from('exam_sessions').select('*').eq('id', id).maybeSingle())
  if (!session) notFound()

  await finalizeExpired(id)
  const [questions, attempts, violations] = await Promise.all([
    db().from('questions').select('*').eq('session_id', id).order('position').then(must) as Promise<Question[]>,
    db().from('attempts').select('*').eq('session_id', id).order('started_at').then(must) as Promise<Attempt[]>,
    db()
      .from('violations')
      .select('id, attempt_id, type, created_at, attempts!inner(session_id)')
      .eq('attempts.session_id', id)
      .order('created_at')
      .then(must) as Promise<Violation[]>,
  ])
  const byAttempt = Map.groupBy(violations, (v) => v.attempt_id)

  const h = await headers()
  const link = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}/s/${session.code}`
  const qr = await QRCode.toDataURL(link, { width: 480, margin: 1 })

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-4">
      <header>
        <Link href="/admin" className="text-sm underline">
          ← Semua sesi
        </Link>
        <h1 className="mt-1 text-xl font-bold">{session.title}</h1>
        <p className="text-sm text-muted">
          {session.kind === 'pre' ? 'Pre-test' : 'Post-test'} · kode {session.code}
        </p>
      </header>

      {msg && <p className="rounded bg-warn-soft p-3 text-sm">{msg}</p>}

      <section className="grid gap-4 rounded border border-line bg-surface p-4 sm:grid-cols-[240px_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL, nothing to optimize */}
        <img src={qr} alt={`QR ${link}`} className="w-full" />
        <div className="space-y-3">
          <h2 className="font-semibold">Akses peserta</h2>
          <p className="font-mono text-sm break-all">{link}</p>
          <p className={session.is_open ? 'text-ok' : 'text-muted'}>
            {session.is_open ? 'Sesi dibuka — peserta bisa mulai.' : 'Sesi ditutup — peserta belum bisa mulai.'}
          </p>
          <form action={setOpen.bind(null, id, !session.is_open)}>
            <button className="rounded bg-red-600 px-4 py-2 font-semibold text-white">{session.is_open ? 'Tutup sesi' : 'Buka sesi'}</button>
          </form>
        </div>
      </section>

      <section className="space-y-3 rounded border border-line bg-surface p-4">
        <h2 className="font-semibold">Soal ({questions.length})</h2>
        {attempts.length > 0 && <p className="text-sm text-muted">Soal terkunci karena sudah ada peserta. Reset semua peserta untuk mengubah soal.</p>}
        <ol className="space-y-2">
          {questions.map((q, i) => (
            <li key={q.id} className="rounded border border-line p-3 text-sm">
              <p className="whitespace-pre-line font-medium">
                {i + 1}. {q.text}
              </p>
              <ul className="mt-1 space-y-0.5">
                {q.options.map((option, j) => (
                  <li key={j} className={j === q.answer_index ? 'font-semibold text-ok' : 'text-secondary'}>
                    {q.type === 'mc' && `${String.fromCodePoint(65 + j)}. `}
                    {option}
                    {j === q.answer_index && ' ✓'}
                  </li>
                ))}
              </ul>
              {attempts.length === 0 && (
                <div className="mt-2 flex flex-wrap items-start gap-3">
                  <details className="min-w-0 flex-1">
                    <summary className="cursor-pointer text-xs underline">Edit</summary>
                    <div className="mt-2">
                      <QuestionForm action={saveQuestion.bind(null, id, q.id)} question={q} submitLabel="Simpan soal" />
                    </div>
                  </details>
                  <form action={deleteQuestion.bind(null, id, q.id)}>
                    <ConfirmButton message={`Hapus soal ${i + 1}?`} className="text-xs text-danger underline">
                      Hapus
                    </ConfirmButton>
                  </form>
                </div>
              )}
            </li>
          ))}
          {!questions.length && <li className="text-sm text-muted">Belum ada soal. Tambah manual atau upload CSV di bawah.</li>}
        </ol>

        {attempts.length === 0 && (
          <>
            <details open={!questions.length} className="rounded border border-line p-3">
              <summary className="cursor-pointer font-semibold">+ Tambah soal manual</summary>
              <div className="mt-3">
                <QuestionForm action={saveQuestion.bind(null, id, null)} submitLabel="Tambah soal" />
              </div>
            </details>

            <details className="rounded border border-line p-3">
              <summary className="cursor-pointer font-semibold">Upload CSV (ganti semua soal)</summary>
              <form action={uploadQuestions.bind(null, id)} className="mt-3 flex flex-wrap items-center gap-2">
                {/* No accept filter: Android often labels .csv with other MIME types and greys the file out. */}
                <input type="file" name="file" required className="min-w-0 text-sm" />
                {questions.length ? (
                  <ConfirmButton
                    message={`Upload akan MENGGANTI ${questions.length} soal yang ada. Lanjutkan?`}
                    className="rounded border border-line-strong px-4 py-2 text-sm"
                  >
                    Upload &amp; ganti semua soal
                  </ConfirmButton>
                ) : (
                  <button className="rounded border border-line-strong px-4 py-2 text-sm">Upload &amp; ganti semua soal</button>
                )}
              </form>
              <p className="mt-2 text-sm text-muted">
                Kolom CSV: <code>type,question,a,b,c,d,e,answer</code>. type <code>pg</code> (pilihan ganda) atau <code>bs</code> (benar/salah);
                answer huruf opsi, atau B/S untuk benar/salah. Dari Excel/Google Sheets: Save As / Download → CSV.{' '}
                <a href="/contoh-soal.csv" download className="underline">
                  Unduh contoh
                </a>
              </p>
            </details>
          </>
        )}
      </section>

      <section className="rounded border border-line bg-surface p-4">
        <h2 className="mb-3 font-semibold">Pengaturan</h2>
        <SessionForm action={updateSession.bind(null, id)} session={session} submitLabel="Simpan pengaturan" />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Peserta ({attempts.length})</h2>
          <div className="flex gap-2">
            <a href={`/admin/sessions/${id}/export`} className="rounded border border-line-strong bg-surface px-3 py-1.5 text-sm">
              Export CSV
            </a>
            <form action={resetAllAttempts.bind(null, id)}>
              <ConfirmButton
                message="Hapus SEMUA peserta beserta jawabannya di sesi ini?"
                className="rounded border border-danger-line bg-surface px-3 py-1.5 text-sm text-danger"
              >
                Reset semua
              </ConfirmButton>
            </form>
          </div>
        </div>
        <div className="overflow-x-auto rounded border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left">
              <tr>
                <th className="p-2">Nama</th>
                <th className="p-2">NIM</th>
                <th className="p-2">Nilai</th>
                <th className="p-2">Pelanggaran</th>
                <th className="p-2">Status</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.id} className="border-t border-line align-top">
                  <td className="p-2">{a.name}</td>
                  <td className="p-2">{a.nim}</td>
                  <td className="p-2">{a.score ?? '–'}</td>
                  <td className="p-2">
                    {a.violation_count === 0 ? (
                      '0'
                    ) : (
                      <details>
                        <summary className="cursor-pointer">{a.violation_count}</summary>
                        <ul className="mt-1 text-xs text-secondary">
                          {(byAttempt.get(a.id) ?? []).map((v) => (
                            <li key={v.id}>
                              {time(v.created_at)} · {VIOLATION[v.type] ?? v.type}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td className="p-2">{a.submit_reason ? STATUS[a.submit_reason] : 'Mengerjakan'}</td>
                  <td className="p-2">
                    <form action={resetAttempt.bind(null, id, a.id)}>
                      <ConfirmButton message={`Reset ${a.name}? Jawabannya dihapus dan peserta ini bisa mulai ulang.`} className="text-xs text-danger underline">
                        Reset
                      </ConfirmButton>
                    </form>
                  </td>
                </tr>
              ))}
              {!attempts.length && (
                <tr>
                  <td colSpan={6} className="p-3 text-muted">
                    Belum ada peserta.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

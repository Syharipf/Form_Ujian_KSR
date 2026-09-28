import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { requireAdmin } from '@/lib/admin-auth'
import { finalizeExpired, resultsStatus, UUID } from '@/lib/attempts'
import { db, must } from '@/lib/db'
import { formatDate, isOpen, type Attempt, type Question, type ResultsStatus, type Session } from '@/lib/exam'
import { deleteQuestion, deleteSession, resetAllAttempts, resetAttempt, saveQuestion, setOpen, updateSession, uploadQuestions } from '../../actions'
import LinkPending from '@/app/link-pending'
import SubmitButton from '@/app/submit-button'
import QuestionForm from '../../question-form'
import SessionForm from '../../session-form'
import { AutoRefresh, Countdown } from './live'

const STATUS = { manual: 'Selesai', timeout: 'Waktu habis', violation: 'Auto-submit (pelanggaran)' } as const
const STATUS_STYLE = { manual: 'bg-ok-soft text-ok', timeout: 'bg-subtle text-secondary', violation: 'bg-danger-soft text-danger', working: 'bg-warn-soft' }
// A Map, not an object literal: a stored type like '__proto__' must miss, not render Object.prototype.
const VIOLATION = new Map([
  ['hidden', 'pindah aplikasi/tab'],
  ['blur', 'hilang fokus'],
  ['fullscreen_exit', 'keluar layar penuh'],
  ['resize', 'layar mengecil (split screen)'],
  ['reopen', 'membuka ulang ujian'],
])

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' })

// Participants see their score only once resultsStatus() releases it: session closed and nobody still
// working. Until then a countdown runs to the last participant's deadline.
function ScoreStatus({ results, working, serverNow }: Readonly<{ results: ResultsStatus; working: number; serverNow: number }>) {
  if (results.released) return <>Nilai sudah terlihat oleh peserta di HP masing-masing.</>
  if (results.at === null) return <>Nilai belum terlihat peserta. Nilai muncul serentak setelah sesi ditutup dan semua peserta selesai.</>
  return (
    <>
      Nilai belum terlihat peserta{working > 0 && <>: {working} peserta masih mengerjakan</>}. Nilai muncul serentak dalam{' '}
      <Countdown until={results.at} serverNow={serverNow} /> (pukul {time(new Date(results.at).toISOString())} WIB).
    </>
  )
}

type Violation = { id: string; attempt_id: string; type: string; created_at: string }

export default async function SessionAdminPage(props: PageProps<'/admin/sessions/[id]'>) {
  await requireAdmin()
  const { id } = await props.params
  const { msg } = await props.searchParams
  if (!UUID.test(id)) notFound()
  const session: Session | null = must(await db().from('exam_sessions').select('*').eq('id', id).maybeSingle())
  if (!session) notFound()

  await finalizeExpired(id)
  const [questions, attempts, violations, results] = await Promise.all([
    db().from('questions').select('*').eq('session_id', id).order('position').then(must) as Promise<Question[]>,
    db().from('attempts').select('*').eq('session_id', id).order('started_at').then(must) as Promise<Attempt[]>,
    db()
      .from('violations')
      .select('id, attempt_id, type, created_at, attempts!inner(session_id)')
      .eq('attempts.session_id', id)
      .order('created_at')
      .then(must) as Promise<Violation[]>,
    resultsStatus(session),
  ])
  const working = attempts.filter((a) => !a.submitted_at).length
  // eslint-disable-next-line react-hooks/purity -- server component, rendered once per request
  const serverNow = Date.now()
  const open = isOpen(session, serverNow)
  const byAttempt = Map.groupBy(violations, (v) => v.attempt_id)

  const h = await headers()
  const link = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}/s/${session.code}`
  const qr = await QRCode.toDataURL(link, { width: 480, margin: 1 })

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 pb-12">
      <header className="pt-2">
        <Link href="/admin" className="text-sm font-semibold text-muted hover:text-fg">
          ← Semua sesi <LinkPending />
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 text-2xl font-extrabold tracking-tight">{session.title}</h1>
          <span className={`badge ${open ? 'bg-ok-soft text-ok' : 'bg-subtle text-muted'}`}>{open ? 'Dibuka' : 'Ditutup'}</span>
        </div>
        <p className="mt-1 text-sm text-muted">
          {formatDate(session.held_on)} · {session.kind === 'pre' ? 'Pre-test' : 'Post-test'} · kode {session.code}
        </p>
      </header>

      {/* Joins, answers, violations and the score release only happen while someone can still work. */}
      {(open || working > 0 || results.at !== null) && <AutoRefresh />}
      {msg && (
        <output className="block rounded-xl bg-warn-soft p-3 text-sm font-medium">{msg}</output>
      )}

      <section className="card grid gap-5 p-4 sm:grid-cols-[220px_1fr] sm:p-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL, nothing to optimize */}
        <img src={qr} alt={`QR ${link}`} className="w-full rounded-xl bg-white p-2 ring-1 ring-line" />
        <div className="space-y-3">
          <h2 className="text-lg font-bold">Akses peserta</h2>
          <p className="rounded-lg bg-subtle px-3 py-2 font-mono text-sm break-all">{link}</p>
          <p className={`font-semibold ${open ? 'text-ok' : 'text-muted'}`}>
            {open ? 'Sesi dibuka — peserta bisa mulai.' : session.is_open ? 'Sesi ditutup otomatis — durasi ujian sudah habis.' : 'Sesi ditutup — peserta belum bisa mulai.'}
          </p>
          {open && session.closes_at && (
            <p className="text-sm text-muted">
              Tutup otomatis dalam <Countdown until={Date.parse(session.closes_at)} serverNow={serverNow} /> (pukul {time(session.closes_at)} WIB). Peserta yang sudah mulai
              tetap mendapat waktu penuh.
            </p>
          )}
          <p className="text-sm text-muted">
            <ScoreStatus results={results} working={working} serverNow={serverNow} />
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={setOpen.bind(null, id, !open)}>
              <SubmitButton className={`btn ${open ? 'btn-secondary' : 'btn-primary'}`}>{open ? 'Tutup sesi' : 'Buka sesi'}</SubmitButton>
            </form>
            <a href={`/admin/sessions/${id}/qr`} target="_blank" className="btn btn-secondary">
              Tayangkan QR &amp; kode
            </a>
          </div>
          <p className="text-xs text-muted">Untuk share screen atau proyektor, tayangkan halaman QR (tab baru), bukan halaman ini: daftar soal di bawah memuat kunci jawaban.</p>
        </div>
      </section>

      <section className="card space-y-4 p-4 sm:p-6">
        <h2 className="text-lg font-bold">Soal ({questions.length})</h2>
        {attempts.length > 0 && <p className="text-sm text-muted">Soal terkunci karena sudah ada peserta. Reset semua peserta untuk mengubah soal.</p>}
        <ol className="space-y-2">
          {questions.map((q, i) => (
            <li key={q.id} className="rounded-xl border border-line p-4 text-sm">
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
                    <SubmitButton confirm={`Hapus soal ${i + 1}?`} className="text-xs text-danger underline">
                      Hapus
                    </SubmitButton>
                  </form>
                </div>
              )}
            </li>
          ))}
          {!questions.length && <li className="text-sm text-muted">Belum ada soal. Tambah manual atau upload CSV di bawah.</li>}
        </ol>

        {attempts.length === 0 && (
          <>
            <details open={!questions.length} className="rounded-xl border border-line p-4">
              <summary className="cursor-pointer font-semibold">+ Tambah soal manual</summary>
              <div className="mt-3">
                <QuestionForm action={saveQuestion.bind(null, id, null)} submitLabel="Tambah soal" />
              </div>
            </details>

            <details className="rounded-xl border border-line p-4">
              <summary className="cursor-pointer font-semibold">Upload CSV (ganti semua soal)</summary>
              <form action={uploadQuestions.bind(null, id)} className="mt-3 flex flex-wrap items-center gap-2">
                {/* No accept filter: Android often labels .csv with other MIME types and greys the file out. */}
                <input type="file" name="file" required className="min-w-0 text-sm" />
                {questions.length ? (
                  <SubmitButton
                    confirm={`Upload akan MENGGANTI ${questions.length} soal yang ada. Lanjutkan?`}
                    className="btn btn-secondary text-sm"
                  >
                    Upload &amp; ganti semua soal
                  </SubmitButton>
                ) : (
                  <SubmitButton className="btn btn-secondary text-sm">Upload &amp; ganti semua soal</SubmitButton>
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

      <section className="card p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-bold">Pengaturan</h2>
        {attempts.length > 0 && (
          <p className="-mt-2 mb-4 text-sm text-muted">Mode timer, durasi, dan waktu per soal terkunci selama ada peserta.</p>
        )}
        <SessionForm action={updateSession.bind(null, id)} session={session} submitLabel="Simpan pengaturan" />
        <form action={deleteSession.bind(null, id)} className="mt-6 border-t border-line pt-4">
          <SubmitButton
            confirm={`Hapus sesi "${session.title}" beserta ${questions.length} soal dan ${attempts.length} peserta? Tidak bisa dibatalkan.`}
            className="btn btn-danger text-sm"
          >
            Hapus sesi
          </SubmitButton>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Peserta ({attempts.length})</h2>
          <div className="flex gap-2">
            <a href={`/admin/sessions/${id}/export`} className="btn btn-secondary text-sm">
              Export CSV
            </a>
            <form action={resetAllAttempts.bind(null, id)}>
              <SubmitButton
                confirm="Hapus SEMUA peserta beserta jawabannya di sesi ini?"
                className="btn btn-danger text-sm"
              >
                Reset semua
              </SubmitButton>
            </form>
          </div>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="p-3">Nama</th>
                <th className="p-3">NIM</th>
                <th className="p-3">Nilai</th>
                <th className="p-3">Pelanggaran</th>
                <th className="p-3">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.id} className="border-t border-line align-top">
                  <td className="p-3">{a.name}</td>
                  <td className="p-3">{a.nim}</td>
                  <td className="p-3">{a.score ?? '–'}</td>
                  <td className="p-3">
                    {a.violation_count === 0 ? (
                      '0'
                    ) : (
                      <details>
                        <summary className="cursor-pointer">{a.violation_count}</summary>
                        <ul className="mt-1 text-xs text-secondary">
                          {(byAttempt.get(a.id) ?? []).map((v) => (
                            <li key={v.id}>
                              {time(v.created_at)} · {VIOLATION.get(v.type) ?? v.type}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={`badge ${STATUS_STYLE[a.submit_reason ?? 'working']}`}>{a.submit_reason ? STATUS[a.submit_reason] : 'Mengerjakan'}</span>
                  </td>
                  <td className="p-3">
                    <form action={resetAttempt.bind(null, id, a.id)}>
                      <SubmitButton confirm={`Reset ${a.name}? Jawabannya dihapus dan peserta ini bisa mulai ulang.`} className="text-xs text-danger underline">
                        Reset
                      </SubmitButton>
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

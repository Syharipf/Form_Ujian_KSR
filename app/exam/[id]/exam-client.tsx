'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Notice from '@/app/notice'
import { PendingLabel } from '@/app/pending'
import ThemeToggle from '@/app/theme-toggle'
import { clock, GRACE_MS, LOBBY_POLL_MS, type ExamView, type PublicQuestion } from '@/lib/exam'
import { enterFullscreen, exitFullscreen, isFullscreen, subscribeFullscreen } from '@/lib/fullscreen'
import Confetti from './confetti'
import { useAntiCheat } from './use-anti-cheat'
import Watermark from './watermark'

type ApiError = Error & { status?: number }

async function call(path: string, body?: object): Promise<ExamView> {
  const res = await fetch(
    path,
    body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' },
  ).catch(() => {
    throw new Error('Koneksi bermasalah, coba lagi')
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error ?? 'Terjadi kesalahan, coba lagi'), { status: res.status })
  return data
}

// Drop the "resume" pointer for this attempt. After a submit, keep a `result:<code>` pointer
// so the join page can link back here to show the score once it is released.
function forget(id: string, submitted = false) {
  try {
    for (const key of Object.keys(localStorage)) {
      if (localStorage.getItem(key) !== id) continue
      if (key.startsWith('attempt:')) {
        localStorage.removeItem(key)
        if (submitted) localStorage.setItem(`result:${key.slice('attempt:'.length)}`, id)
      } else if (key.startsWith('result:') && !submitted) localStorage.removeItem(key)
    }
  } catch {}
}

const RESULT_POLL_MS = 15_000
const RESULT_RETRY_MS = 2_000

// While waiting for scores: poll every RESULT_POLL_MS, but once the release moment is closer than
// that, wake exactly at it so every participant's score appears at the same time.
function nextResultCheck(untilRelease: number | null) {
  if (untilRelease === null || untilRelease > RESULT_POLL_MS) return RESULT_POLL_MS
  if (untilRelease > 0) return untilRelease
  return RESULT_RETRY_MS
}

// Submitted but score not released yet: check back until it is (re-armed after every check, even a
// failed one), waking exactly at the shared release moment when it is near.
function useResultChecks(view: ExamView | null, offset: number, refresh: () => Promise<unknown>) {
  const [checks, setChecks] = useState(0)
  const waiting = view?.status === 'submitted' && view.score === undefined
  const resultsAt = view?.results_at ?? null
  useEffect(() => {
    if (!waiting) return
    const delay = nextResultCheck(resultsAt === null ? null : resultsAt - (Date.now() + offset))
    const t = setTimeout(() => refresh().finally(() => setChecks((n) => n + 1)), delay)
    return () => clearTimeout(t)
  }, [waiting, resultsAt, offset, refresh, checks])
}

// Lobby: check every LOBBY_POLL_MS (spread out a little so a full room doesn't ask at once) until the
// start time is known, then wake exactly at it so everyone's questions appear together. Re-armed after
// every check, even a failed one.
function useStartChecks(view: ExamView | null, offset: number, refresh: () => Promise<unknown>) {
  const [checks, setChecks] = useState(0)
  const waiting = view?.status === 'waiting'
  const startsAt = view?.starts_at ?? null
  useEffect(() => {
    if (!waiting) return
    const delay = startsAt === null ? LOBBY_POLL_MS + Math.random() * 1000 : Math.max(0, startsAt - (Date.now() + offset))
    const t = setTimeout(() => refresh().finally(() => setChecks((n) => n + 1)), delay)
    return () => clearTimeout(t)
  }, [waiting, startsAt, offset, refresh, checks])
}

export default function ExamClient({ id }: { id: string }) {
  const base = `/api/attempts/${id}`
  const [view, setView] = useState<ExamView | null>(null)
  const [offset, setOffset] = useState(0) // server clock − device clock
  const [fatal, setFatal] = useState<ApiError | null>(null)
  const [notice, setNotice] = useState('')
  const [warning, setWarning] = useState('')
  const [picked, setPicked] = useState<{ id: string; choice: number } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const fullscreen = useSyncExternalStore(subscribeFullscreen, isFullscreen, () => true)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const pending = useRef(0)

  const apply = useCallback((v: ExamView) => {
    setView(v)
    setOffset(v.server_now - Date.now())
  }, [])

  const onError = useCallback((e: ApiError) => {
    if (e.status === 404) {
      forget(id)
      setFatal(e)
    } else setNotice(e.message)
  }, [id])

  const refresh = useCallback(() => call(base).then(apply, onError), [base, apply, onError])

  const reportViolation = useCallback(
    (type: string) => {
      call(`${base}/violation`, { type }).then((v) => {
        apply(v)
        if (v.status === 'active') {
          setWarning(
            `Pelanggaran ${v.violation_count} dari ${v.max_violations}. Jangan keluar dari layar ujian. ` +
              `Pada pelanggaran ke-${v.max_violations}, jawabanmu otomatis dikumpulkan.`,
          )
        }
      }, onError)
    },
    [base, apply, onError],
  )

  // First load. Arriving without the "fresh" flag from the join page = reopened/reloaded → violation.
  useEffect(() => {
    let fresh = false
    try {
      fresh = sessionStorage.getItem(`fresh:${id}`) === '1'
    } catch {}
    let cancelled = false
    call(base).then(
      (v) => {
        if (cancelled) return
        try {
          sessionStorage.removeItem(`fresh:${id}`)
        } catch {}
        apply(v)
        if (!fresh && v.status === 'active') reportViolation('reopen')
      },
      (e) => {
        if (!cancelled) onError(e)
      },
    )
    return () => {
      cancelled = true
    }
  }, [id, base, apply, onError, reportViolation])

  const active = view?.status === 'active'
  useAntiCheat(active, reportViolation, active || view?.status === 'waiting')

  const deadline = view ? (view.question_deadline_at ?? view.deadline_at) : 0

  // When the timer runs out, let the server (which allows GRACE_MS) skip the question or submit.
  // Re-armed by every new view, so a check that comes back still active tries again.
  useEffect(() => {
    if (!active) return
    const t = setTimeout(refresh, Math.max(0, deadline - (Date.now() + offset)) + GRACE_MS + 500)
    return () => clearTimeout(t)
  }, [active, deadline, offset, view, refresh])

  useEffect(() => {
    if (view?.status !== 'submitted') return
    exitFullscreen()
    forget(id, true)
  }, [view, id])

  useResultChecks(view, offset, refresh)
  useStartChecks(view, offset, refresh)

  if (fatal) return <Notice title="Tidak bisa membuka ujian" body={fatal.message} />
  if (!view) return <Notice title="Memuat ujian…" />
  if (view.status === 'submitted') return <Submitted view={view} offset={offset} />
  if (view.status === 'waiting') return <Waiting view={view} offset={offset} />

  // Answers and submit run one at a time so each response includes every earlier answer,
  // and a quick "Kumpulkan" never overtakes the last pick. Only the final response is applied,
  // otherwise an older response would briefly hide newer optimistic picks.
  function enqueue(task: () => Promise<ExamView>) {
    pending.current++
    const run = queue.current.then(task).then(
      (v) => {
        if (--pending.current === 0) apply(v)
      },
      (e: ApiError) => {
        pending.current--
        onError(e)
        refresh()
      },
    )
    queue.current = run
    return run
  }

  function answerTotal(questionId: string, choice: number) {
    setNotice('')
    setView((v) => v && { ...v, answers: { ...v.answers, [questionId]: choice } })
    enqueue(() => call(`${base}/answer`, { question_id: questionId, choice }))
  }

  function answerCurrent(questionId: string, choice: number) {
    setNotice('')
    setBusy(true)
    enqueue(() => call(`${base}/answer`, { question_id: questionId, choice })).finally(() => setBusy(false))
  }

  function submit() {
    setBusy(true)
    enqueue(() => call(`${base}/submit`, {})).finally(() => {
      setBusy(false)
      setConfirming(false)
    })
  }

  const current = view.timer_mode === 'per_question' ? view.questions[0] : undefined
  const pickedChoice = current && picked?.id === current.id ? picked.choice : null
  const answered = Object.keys(view.answers).length
  const locked = warning !== '' || !fullscreen

  return (
    <div className="no-select min-h-dvh">
      <Watermark text={`${view.name} · ${view.nim}`} />

      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-bold">{view.title}</p>
            <p className={`text-xs ${view.violation_count ? 'font-semibold text-danger' : 'text-muted'}`}>
              Pelanggaran {view.violation_count}/{view.max_violations}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle compact />
            <Clock deadline={deadline} offset={offset} />
          </div>
        </div>
        {/* progress: questions done (per question) or answered (total) */}
        <div className="h-1 bg-subtle">
          <div
            className="h-full bg-primary transition-[width] duration-300"
            style={{ width: `${(100 * (view.timer_mode === 'per_question' ? view.current_index : answered)) / Math.max(1, view.total)}%` }}
          />
        </div>
      </header>

      {notice && <p className="bg-warn-soft px-4 py-2 text-center text-sm">{notice}</p>}

      <main className="mx-auto max-w-2xl space-y-6 p-4 pb-10">
        {view.timer_mode === 'per_question' ? (
          current && (
            <section className="space-y-4">
              <p className="text-sm font-semibold text-muted">
                Soal {view.current_index + 1} dari {view.total}
              </p>
              <QuestionCard q={current} selected={pickedChoice} onPick={(choice) => setPicked({ id: current.id, choice })} />
              <button
                disabled={pickedChoice === null || busy}
                onClick={() => pickedChoice !== null && answerCurrent(current.id, pickedChoice)}
                aria-busy={busy}
                className="btn btn-primary w-full"
              >
                <PendingLabel pending={busy}>{view.current_index + 1 === view.total ? 'Jawab & selesai' : 'Jawab & lanjut'}</PendingLabel>
              </button>
            </section>
          )
        ) : (
          <>
            {view.questions.map((q, i) => (
              <section key={q.id} className="space-y-2">
                <p className="text-sm font-semibold text-muted">Soal {i + 1}</p>
                <QuestionCard q={q} selected={view.answers[q.id] ?? null} onPick={(choice) => answerTotal(q.id, choice)} />
              </section>
            ))}
            {confirming ? (
              <div className="card border-danger-line p-4">
                <p>
                  {answered} dari {view.total} soal terjawab. Kumpulkan sekarang? Jawaban tidak bisa diubah lagi.
                </p>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setConfirming(false)} className="btn btn-secondary flex-1">
                    Batal
                  </button>
                  <button disabled={busy} aria-busy={busy} onClick={submit} className="btn btn-primary flex-1">
                    <PendingLabel pending={busy}>Kumpulkan</PendingLabel>
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirming(true)} className="btn btn-primary w-full">
                Kumpulkan jawaban
              </button>
            )}
          </>
        )}
      </main>

      {locked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-6 text-center text-white">
          <div className="max-w-sm space-y-4">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-red-600/20 text-red-400">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
              </svg>
            </span>
            <p className="text-lg font-bold">{warning ? 'Peringatan' : 'Layar ujian terkunci'}</p>
            <p>{warning || 'Ketuk tombol di bawah untuk kembali ke layar penuh dan melanjutkan ujian.'}</p>
            <button
              onClick={() => {
                enterFullscreen()
                setWarning('')
              }}
              className="btn w-full bg-white text-slate-900 hover:bg-slate-100"
            >
              Saya mengerti, lanjutkan
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const cheer = (score: number) => (score >= 80 ? 'Luar biasa!' : score >= 60 ? 'Kerja bagus!' : 'Terima kasih sudah berjuang!')

// Ticks every 250 ms. Only the small clock components use it, so the question list doesn't
// re-render four times a second.
function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])
  return now
}

function Clock({ deadline, offset }: Readonly<{ deadline: number; offset: number }>) {
  const remaining = Math.max(0, deadline - (useNow() + offset))
  return (
    <p role="timer" className={`rounded-lg px-2.5 py-1 font-mono text-lg font-bold tabular-nums ${remaining < 10_000 ? 'bg-danger-soft text-danger' : 'bg-subtle'}`}>
      {clock(remaining)}
    </p>
  )
}

// Countdown to the moment scores are released for everyone.
function ReleaseCountdown({ at, offset }: Readonly<{ at: number; offset: number }>) {
  const left = Math.max(0, at - (useNow() + offset))
  return (
    <>
      <p role="timer" className="my-2 font-mono text-5xl font-bold tabular-nums text-primary">
        {clock(left)}
      </p>
      <p className="text-sm text-muted">{left ? 'Menunggu peserta lain menyelesaikan ujian. Biarkan halaman ini terbuka.' : 'Mengambil nilai…'}</p>
    </>
  )
}

function Waiting({ view, offset }: Readonly<{ view: ExamView; offset: number }>) {
  const left = Math.max(0, (view.starts_at ?? 0) - (useNow() + offset))
  return (
    <Notice title={view.title} body={`${view.name} · ${view.nim}`}>
      {view.starts_at === null ? (
        <p className="mt-2 text-secondary">Kamu sudah masuk. Tunggu panitia memulai ujian — soal muncul otomatis di sini. Biarkan halaman ini terbuka.</p>
      ) : (
        <>
          <p className="mt-2 text-secondary">Ujian dimulai dalam</p>
          <p role="timer" className="font-mono text-5xl font-bold tabular-nums text-primary">
            {clock(left)}
          </p>
        </>
      )}
    </Notice>
  )
}

function Submitted({ view, offset }: Readonly<{ view: ExamView; offset: number }>) {
  const celebrate = view.submit_reason !== 'violation'
  const title = celebrate ? 'Selamat, kamu sudah selesai! 🎉' : 'Ujian dikumpulkan otomatis'
  if (view.score === undefined && view.results_at === null) {
    return (
      <Notice
        title={title}
        body="Jawaban terkirim. Nilai akan muncul di halaman ini setelah panitia menutup sesi dan semua peserta selesai. Biarkan halaman ini terbuka, atau buka lagi QR/link ujian nanti."
      >
        {celebrate && <Confetti />}
      </Notice>
    )
  }
  if (view.score === undefined) {
    return (
      <Notice title={title} body="Jawaban terkirim. Nilai semua peserta muncul serentak dalam">
        {celebrate && <Confetti />}
        <ReleaseCountdown at={view.results_at ?? 0} offset={offset} />
      </Notice>
    )
  }
  return (
    <Notice title={view.title} body={`${view.name} · ${view.nim}`}>
      {celebrate && <Confetti key="score" /> /* new key: replay the burst when the score arrives */}
      <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-muted">Nilaimu</p>
      <p className="pop-in mx-auto flex size-32 items-center justify-center rounded-full bg-primary-soft text-6xl font-extrabold text-primary tabular-nums ring-8 ring-primary-soft/50">
        {view.score}
      </p>
      {celebrate && <p className="pop-in mt-2 text-lg font-bold [animation-delay:300ms]">🎉 {cheer(view.score)}</p>}
    </Notice>
  )
}

function QuestionCard({ q, selected, onPick }: { q: PublicQuestion; selected: number | null; onPick: (choice: number) => void }) {
  return (
    <div className="card p-4 sm:p-5">
      <p className="mb-4 whitespace-pre-line font-medium leading-relaxed">{q.text}</p>
      <div className="grid gap-2.5">
        {q.options.map((option, i) => {
          const on = selected === i
          return (
            <button
              key={i}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(i)}
              className={`flex min-h-12 min-w-0 items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors ${
                on ? 'border-primary bg-primary-soft font-semibold' : 'border-line hover:border-line-strong'
              }`}
            >
              {q.type === 'mc' && (
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${on ? 'bg-primary text-on-primary' : 'bg-subtle'}`}
                >
                  {String.fromCodePoint(65 + i)}.
                </span>
              )}
              <span className="min-w-0">{option}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

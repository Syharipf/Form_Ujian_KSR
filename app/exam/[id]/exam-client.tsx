'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Notice from '@/app/notice'
import { PendingLabel } from '@/app/pending'
import ThemeToggle from '@/app/theme-toggle'
import { GRACE_MS, type ExamView, type PublicQuestion } from '@/lib/exam'
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

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function ExamClient({ id }: { id: string }) {
  const base = `/api/attempts/${id}`
  const [view, setView] = useState<ExamView | null>(null)
  const [offset, setOffset] = useState(0) // server clock − device clock
  const [now, setNow] = useState(() => Date.now())
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

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])

  const active = view?.status === 'active'
  useAntiCheat(active, reportViolation)

  const deadline = view ? (view.question_deadline_at ?? view.deadline_at) : 0
  const remaining = Math.max(0, deadline - (now + offset))
  const expired = active && remaining === 0

  // Timer ran out: let the server (which allows GRACE_MS) skip the question or submit.
  useEffect(() => {
    if (!expired) return
    const t = setTimeout(refresh, GRACE_MS + 500)
    return () => clearTimeout(t)
  }, [expired, view, refresh])

  useEffect(() => {
    if (view?.status !== 'submitted') return
    exitFullscreen()
    forget(id, true)
  }, [view, id])

  // Submitted but score not released yet: check back until the session is over.
  const waitingForScore = view?.status === 'submitted' && view.score === undefined
  useEffect(() => {
    if (!waitingForScore) return
    const t = setInterval(refresh, RESULT_POLL_MS)
    return () => clearInterval(t)
  }, [waitingForScore, refresh])

  if (fatal) return <Notice title="Tidak bisa membuka ujian" body={fatal.message} />
  if (!view) return <Notice title="Memuat ujian…" />
  if (view.status === 'submitted') return <Submitted view={view} />

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

      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{view.title}</p>
          <p className="text-xs text-muted">
            Pelanggaran {view.violation_count}/{view.max_violations}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle compact />
          <p className={`font-mono text-lg font-bold ${remaining < 10_000 ? 'text-danger' : ''}`}>{clock(remaining)}</p>
        </div>
      </header>

      {notice && <p className="bg-warn-soft px-4 py-2 text-sm">{notice}</p>}

      <main className="mx-auto max-w-2xl space-y-6 p-4 pb-10">
        {view.timer_mode === 'per_question' ? (
          current && (
            <section className="space-y-4">
              <p className="text-sm text-muted">
                Soal {view.current_index + 1} dari {view.total}
              </p>
              <QuestionCard q={current} selected={pickedChoice} onPick={(choice) => setPicked({ id: current.id, choice })} />
              <button
                disabled={pickedChoice === null || busy}
                onClick={() => pickedChoice !== null && answerCurrent(current.id, pickedChoice)}
                aria-busy={busy}
                className={`relative w-full rounded bg-red-600 p-3 font-semibold text-white ${pickedChoice === null ? 'opacity-40' : ''}`}
              >
                <PendingLabel pending={busy}>{view.current_index + 1 === view.total ? 'Jawab & selesai' : 'Jawab & lanjut'}</PendingLabel>
              </button>
            </section>
          )
        ) : (
          <>
            {view.questions.map((q, i) => (
              <section key={q.id} className="space-y-2">
                <p className="text-sm text-muted">Soal {i + 1}</p>
                <QuestionCard q={q} selected={view.answers[q.id] ?? null} onPick={(choice) => answerTotal(q.id, choice)} />
              </section>
            ))}
            {confirming ? (
              <div className="rounded-lg border border-danger-line bg-danger-soft p-4">
                <p>
                  {answered} dari {view.total} soal terjawab. Kumpulkan sekarang? Jawaban tidak bisa diubah lagi.
                </p>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setConfirming(false)} className="flex-1 rounded border border-line-strong bg-surface p-3">
                    Batal
                  </button>
                  <button disabled={busy} aria-busy={busy} onClick={submit} className="relative flex-1 rounded bg-red-600 p-3 font-semibold text-white">
                    <PendingLabel pending={busy}>Kumpulkan</PendingLabel>
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirming(true)} className="w-full rounded bg-red-600 p-3 font-semibold text-white">
                Kumpulkan jawaban
              </button>
            )}
          </>
        )}
      </main>

      {locked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900 p-6 text-center text-white">
          <div className="max-w-sm space-y-4">
            <p className="text-lg font-bold">{warning ? 'Peringatan' : 'Layar ujian terkunci'}</p>
            <p>{warning || 'Ketuk tombol di bawah untuk kembali ke layar penuh dan melanjutkan ujian.'}</p>
            <button
              onClick={() => {
                enterFullscreen()
                setWarning('')
              }}
              className="w-full rounded bg-white p-3 font-semibold text-slate-900"
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

function Submitted({ view }: Readonly<{ view: ExamView }>) {
  // The only way to reach the limit is the auto-submit, so no party for that.
  const celebrate = view.violation_count < view.max_violations
  if (view.score === undefined) {
    return (
      <Notice
        title={celebrate ? 'Selamat, kamu sudah selesai! 🎉' : 'Ujian dikumpulkan otomatis'}
        body="Jawaban terkirim. Nilai akan muncul di halaman ini setelah panitia menutup sesi dan semua peserta selesai. Biarkan halaman ini terbuka, atau buka lagi QR/link ujian nanti."
      >
        {celebrate && <Confetti />}
      </Notice>
    )
  }
  return (
    <Notice title={view.title} body={`${view.name} · ${view.nim}`}>
      {celebrate && <Confetti key="score" /> /* new key: replay the burst when the score arrives */}
      <p className="mt-4 text-sm text-muted">Nilaimu</p>
      <p className="pop-in text-6xl font-bold">{view.score}</p>
      {celebrate && <p className="pop-in mt-2 text-lg font-semibold text-danger [animation-delay:300ms]">🎉 {cheer(view.score)}</p>}
    </Notice>
  )
}

function QuestionCard({ q, selected, onPick }: { q: PublicQuestion; selected: number | null; onPick: (choice: number) => void }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="mb-3 whitespace-pre-line font-medium">{q.text}</p>
      <div className="grid gap-2">
        {q.options.map((option, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(i)}
            className={`rounded border p-3 text-left ${selected === i ? 'border-red-600 bg-danger-soft font-semibold' : 'border-line-strong'}`}
          >
            {q.type === 'mc' && <span className="mr-2">{String.fromCharCode(65 + i)}.</span>}
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

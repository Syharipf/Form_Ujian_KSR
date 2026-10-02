// Pure exam rules: ordering, timing, grading and what the participant may see.
// Shared by API routes (server) and the exam page (types only + GRACE_MS).

export type TimerMode = 'total' | 'per_question'
export type SubmitReason = 'manual' | 'timeout' | 'violation'

export interface Session {
  id: string
  code: string
  title: string
  held_on: string // YYYY-MM-DD
  kind: 'pre' | 'post'
  timer_mode: TimerMode
  duration_sec: number
  per_question_sec: number
  max_violations: number
  is_open: boolean
  closes_at: string | null // set by "Mulai ujian": the exam's end, it takes no new participants after it (null = until closed by hand)
  started_at: string | null // set by "Mulai ujian": everyone's clock starts here (null = lobby, participants wait)
}

// Open = opened by the committee and the exam not yet over.
export const isOpen = (s: Pick<Session, 'is_open' | 'closes_at'>, now = Date.now()) =>
  s.is_open && (s.closes_at === null || now < Date.parse(s.closes_at))

// Started = the committee pressed "Mulai ujian" and that moment has come. Before it, participants wait in the lobby.
export const hasStarted = (s: Pick<Session, 'started_at'>, now = Date.now()) => s.started_at !== null && now >= Date.parse(s.started_at)

// Waiting phones check for the start this often; "Mulai ujian" starts the clock a little later than
// that, so every phone knows the start time before it comes and shows the questions at the same moment.
export const LOBBY_POLL_MS = 5000
export const START_DELAY_MS = 2 * LOBBY_POLL_MS + 1000

// '2026-09-27' → '27 Sep 2026'. A bare date parses as UTC midnight, so format in UTC.
export const formatDate = (ymd: string) => new Date(ymd).toLocaleDateString('id-ID', { dateStyle: 'medium', timeZone: 'UTC' })

// ms → 'm:ss', rounding up so a countdown shows 0:00 only when time is really up.
export const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export interface Question {
  id: string
  session_id: string
  position: number
  type: 'mc' | 'tf'
  text: string
  options: string[]
  answer_index: number
}

export interface Attempt {
  id: string
  session_id: string
  name: string
  nim: string
  prodi: string
  question_order: string[]
  option_orders: Record<string, number[]> // question id → original option indices in display order
  answers: Record<string, number> // question id → original option index
  current_index: number
  question_started_at: string
  started_at: string
  deadline_at: string
  submitted_at: string | null
  submit_reason: SubmitReason | null
  score: number | null
  violation_count: number
}

export interface PublicQuestion {
  id: string
  type: 'mc' | 'tf'
  text: string
  options: string[]
}

export interface ExamView {
  status: 'waiting' | 'active' | 'submitted'
  submit_reason: SubmitReason | null
  title: string
  name: string
  nim: string
  timer_mode: TimerMode
  max_violations: number
  violation_count: number
  server_now: number
  starts_at: number | null // waiting: when the questions appear (null = the committee hasn't pressed "Mulai ujian" yet)
  deadline_at: number
  question_deadline_at: number | null
  current_index: number
  total: number
  questions: PublicQuestion[]
  answers: Record<string, number> // question id → display index (total mode only)
  score?: number // only present once results are released (see resultsStatus in attempts.ts)
  results_at: number | null // submitted, not yet released: when scores appear for everyone (null = session still open)
}

export interface ResultsStatus {
  released: boolean
  at: number | null
}
const NOT_RELEASED: ResultsStatus = { released: false, at: null }

export class ExamError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

// Server accepts answers this long after the displayed timer hits zero (network latency).
export const GRACE_MS = 2000

export function shuffle<T>(items: readonly T[], rand = Math.random): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function buildOrder(questions: Question[], rand = Math.random) {
  const option_orders: Record<string, number[]> = {}
  for (const q of questions) {
    const idx = q.options.map((_, i) => i)
    option_orders[q.id] = q.type === 'tf' ? idx : shuffle(idx, rand)
  }
  return { question_order: shuffle(questions.map((q) => q.id), rand), option_orders }
}

export function deadlineFor(s: Pick<Session, 'timer_mode' | 'duration_sec' | 'per_question_sec'>, count: number, start: Date) {
  const sec = s.timer_mode === 'total' ? s.duration_sec : s.per_question_sec * count
  return new Date(start.getTime() + sec * 1000)
}

// An attempt's clock fields when it starts at `start`: the session's start, so latecomers get only the time left.
export function timing(s: Pick<Session, 'timer_mode' | 'duration_sec' | 'per_question_sec'>, count: number, start: Date) {
  const at = start.toISOString()
  return { started_at: at, question_started_at: at, deadline_at: deadlineFor(s, count, start).toISOString() }
}

// Where the attempt should be at `now`: expired per-question slots are skipped (left blank).
export function settle(a: Attempt, s: Session, now: Date) {
  const t = now.getTime() - GRACE_MS
  if (s.timer_mode === 'total') {
    const finish: SubmitReason | null = t >= Date.parse(a.deadline_at) ? 'timeout' : null
    return { current_index: a.current_index, question_started_at: a.question_started_at, finish }
  }
  const per = s.per_question_sec * 1000
  const started = Date.parse(a.question_started_at)
  const skips = Math.max(0, Math.floor((t - started) / per))
  const current_index = a.current_index + skips
  const finish: SubmitReason | null = current_index >= a.question_order.length || t >= Date.parse(a.deadline_at) ? 'timeout' : null
  return { current_index, question_started_at: new Date(started + skips * per).toISOString(), finish }
}

export function grade(a: Pick<Attempt, 'question_order' | 'answers'>, questions: Record<string, Question>) {
  const n = a.question_order.length
  if (n === 0) return 0
  const correct = a.question_order.filter((id) => a.answers[id] !== undefined && a.answers[id] === questions[id]?.answer_index).length
  return Math.round((correct / n) * 100)
}

export function originalIndex(a: Attempt, questionId: string, displayIndex: number) {
  const order = a.option_orders[questionId]
  if (!order || !Number.isInteger(displayIndex) || displayIndex < 0 || displayIndex >= order.length) {
    throw new ExamError(400, 'Jawaban tidak valid')
  }
  return order[displayIndex]
}

// Index transition for recording an answer; `a` must already be settled.
export function planAnswer(a: Attempt, s: Session, questionId: string) {
  if (s.timer_mode === 'per_question') {
    if (a.question_order[a.current_index] !== questionId) throw new ExamError(409, 'Waktu soal ini sudah habis')
    return { expectIndex: a.current_index, nextIndex: a.current_index + 1 }
  }
  if (!a.question_order.includes(questionId)) throw new ExamError(400, 'Soal tidak valid')
  return { expectIndex: a.current_index, nextIndex: a.current_index }
}

// `results`: whether this participant may see their own score yet (session over), and when that happens.
export function buildView(a: Attempt, s: Session, questions: Record<string, Question>, now: Date, results = NOT_RELEASED): ExamView {
  const submitted = a.submitted_at !== null
  const waiting = !submitted && !hasStarted(s, now.getTime())
  const perQuestion = s.timer_mode === 'per_question'
  const ids = submitted || waiting ? [] : perQuestion ? a.question_order.slice(a.current_index, a.current_index + 1) : a.question_order
  const answers: Record<string, number> = {}
  if (!perQuestion) {
    for (const [id, original] of Object.entries(a.answers)) answers[id] = a.option_orders[id].indexOf(original)
  }
  return {
    status: submitted ? 'submitted' : waiting ? 'waiting' : 'active',
    submit_reason: a.submit_reason,
    title: s.title,
    name: a.name,
    nim: a.nim,
    timer_mode: s.timer_mode,
    max_violations: s.max_violations,
    violation_count: a.violation_count,
    server_now: now.getTime(),
    starts_at: s.started_at ? Date.parse(s.started_at) : null,
    deadline_at: Date.parse(a.deadline_at),
    question_deadline_at: perQuestion ? Math.min(Date.parse(a.question_started_at) + s.per_question_sec * 1000, Date.parse(a.deadline_at)) : null,
    current_index: a.current_index,
    total: a.question_order.length,
    questions: ids.map((id) => {
      const q = questions[id]
      return { id, type: q.type, text: q.text, options: a.option_orders[id].map((i) => q.options[i]) }
    }),
    answers,
    results_at: submitted && !results.released ? results.at : null,
    ...(submitted && results.released && a.score !== null ? { score: a.score } : {}),
  }
}

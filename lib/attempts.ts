import { db, must } from './db'
import { buildView, ExamError, grade, GRACE_MS, hasStarted, settle, timing, type Attempt, type Question, type ResultsStatus, type Session, type SubmitReason } from './exam'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface Ctx {
  attempt: Attempt
  session: Session
  questions: Record<string, Question>
}

async function fetchAttempt(id: string): Promise<Attempt | null> {
  return must(await db().from('attempts').select('*').eq('id', id).maybeSingle())
}

type AttemptRow = Attempt & { session: Session & { questions: Question[] } }

// One request: the attempt with its session and questions embedded. Under load the number of Supabase
// requests is the bottleneck (the free tier serves roughly 40 per second), not the queries themselves.
export async function loadCtx(id: string): Promise<Ctx> {
  const row: AttemptRow | null = UUID.test(id)
    ? must(await db().from('attempts').select('*, session:exam_sessions(*, questions(*))').eq('id', id).maybeSingle())
    : null
  if (!row) throw new ExamError(404, 'Ujian tidak ditemukan. Mungkin sudah direset panitia — scan ulang QR.')
  const {
    session: { questions, ...session },
    ...attempt
  } = row
  return { attempt, session, questions: Object.fromEntries(questions.map((q) => [q.id, q])) }
}

export async function finalize(ctx: Ctx, reason: SubmitReason, now: Date) {
  const score = grade(ctx.attempt, ctx.questions)
  const row = must(
    await db()
      .from('attempts')
      .update({ submitted_at: now.toISOString(), submit_reason: reason, score })
      .eq('id', ctx.attempt.id)
      .is('submitted_at', null)
      .select()
      .maybeSingle(),
  )
  // No row: a concurrent request submitted first; take its result.
  ctx.attempt = row ?? (await fetchAttempt(ctx.attempt.id))!
}

// Joined in the lobby but missed the re-time done by "Mulai ujian" (the join landed while it ran):
// start this clock at the session's start like everyone else's.
async function retime(ctx: Ctx) {
  const start = ctx.session.started_at!
  if (Date.parse(ctx.attempt.started_at) >= Date.parse(start)) return
  const row = must(
    await db()
      .from('attempts')
      .update(timing(ctx.session, ctx.attempt.question_order.length, new Date(start)))
      .eq('id', ctx.attempt.id)
      .lt('started_at', start)
      .is('submitted_at', null)
      .select()
      .maybeSingle(),
  )
  ctx.attempt = row ?? (await fetchAttempt(ctx.attempt.id))!
}

// Apply the clock: submit on timeout, skip expired per-question slots. No clock in the lobby.
export async function sync(ctx: Ctx, now: Date) {
  if (ctx.attempt.submitted_at || !hasStarted(ctx.session, now.getTime())) return
  await retime(ctx)
  const s = settle(ctx.attempt, ctx.session, now)
  if (s.finish) return finalize(ctx, s.finish, now)
  if (s.current_index === ctx.attempt.current_index) return
  const row = must(
    await db()
      .from('attempts')
      .update({ current_index: s.current_index, question_started_at: s.question_started_at })
      .eq('id', ctx.attempt.id)
      .eq('current_index', ctx.attempt.current_index)
      .is('submitted_at', null)
      .select()
      .maybeSingle(),
  )
  ctx.attempt = row ?? (await fetchAttempt(ctx.attempt.id))!
}

// Scores are released to everyone at once, only after the session is closed AND nobody is still
// working, so early finishers can't leak anything to those still taking the exam. While someone is
// still working or the session is still taking participants, `at` is when that ends: the countdown
// participants see.
async function lookupResults(session: Session): Promise<ResultsStatus> {
  const working = session.started_at ? await settleExpired(session.id) : []
  // Not before the session closes on its own (plus slack for a join still in flight), so nobody can
  // start after the scores are out.
  const closes = session.is_open && session.closes_at ? Date.parse(session.closes_at) + GRACE_MS : 0
  if (!working.length && Date.now() >= closes) return { released: true, at: null }
  // An attempt is settled only once it is more than GRACE_MS past its deadline; release a second
  // after that so the check made at the countdown's end finds nobody still working.
  return { released: false, at: Math.max(closes, ...working.map((d) => d + GRACE_MS + 1000)) }
}

// Everyone waiting asks at the same moment when the countdown ends, so concurrent requests on one
// server instance share a single lookup for a second instead of querying once per participant.
const recent = new Map<string, { until: number; status: Promise<ResultsStatus> }>()

export function resultsStatus(session: Session): Promise<ResultsStatus> {
  // Open lobby, or open without an end time: wait for "Mulai ujian" / "Tutup sesi".
  if (session.is_open && !session.closes_at) return Promise.resolve({ released: false, at: null })
  const hit = recent.get(session.id)
  if (hit && hit.until > Date.now()) return hit.status
  const status = lookupResults(session)
  recent.set(session.id, { until: Date.now() + 1000, status })
  status.catch(() => recent.delete(session.id))
  return status
}

export async function view(ctx: Ctx, now: Date) {
  const results = ctx.attempt.submitted_at ? await resultsStatus(ctx.session) : undefined
  return buildView(ctx.attempt, ctx.session, ctx.questions, now, results)
}

// Participants who closed the browser never trigger their own timeout: settle every attempt whose
// time ran out, and return the deadlines of those still working.
async function settleExpired(sessionId: string) {
  const cutoff = Date.now() - GRACE_MS
  const unsubmitted: { id: string; deadline_at: string }[] = must(
    await db().from('attempts').select('id, deadline_at').eq('session_id', sessionId).is('submitted_at', null),
  )
  const working = await Promise.all(
    unsubmitted.map(async ({ id, deadline_at }) => {
      const deadline = Date.parse(deadline_at)
      if (deadline >= cutoff) return deadline
      const ctx = await loadCtx(id)
      await sync(ctx, new Date())
      return ctx.attempt.submitted_at ? null : Date.parse(ctx.attempt.deadline_at) // a concurrent start may have re-timed it
    }),
  )
  return working.filter((d): d is number => d !== null)
}

export async function finalizeExpired(sessionId: string) {
  await settleExpired(sessionId)
}

// Reopening a finished exam starts a new round: whoever is still unsubmitted (inside the grace period, or a
// closed browser) is done, so the next "Mulai ujian" can't re-time them into it.
export async function finishRound(sessionId: string) {
  const unsubmitted: { id: string }[] = must(
    await db().from('attempts').select('id').eq('session_id', sessionId).is('submitted_at', null),
  )
  await Promise.all(
    unsubmitted.map(async ({ id }) => {
      const ctx = await loadCtx(id)
      await finalize(ctx, 'timeout', new Date())
    }),
  )
}

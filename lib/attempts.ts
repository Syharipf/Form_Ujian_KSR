import { db, must } from './db'
import { buildView, ExamError, grade, GRACE_MS, settle, type Attempt, type Question, type ResultsStatus, type Session, type SubmitReason } from './exam'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface Ctx {
  attempt: Attempt
  session: Session
  questions: Record<string, Question>
}

async function fetchAttempt(id: string): Promise<Attempt | null> {
  return must(await db().from('attempts').select('*').eq('id', id).maybeSingle())
}

export async function loadCtx(id: string): Promise<Ctx> {
  const attempt = UUID.test(id) ? await fetchAttempt(id) : null
  if (!attempt) throw new ExamError(404, 'Ujian tidak ditemukan. Mungkin sudah direset panitia — scan ulang QR.')
  const [session, questions] = await Promise.all([
    db().from('exam_sessions').select('*').eq('id', attempt.session_id).single().then(must),
    db().from('questions').select('*').eq('session_id', attempt.session_id).then(must),
  ])
  return { attempt, session, questions: Object.fromEntries((questions as Question[]).map((q) => [q.id, q])) }
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

// Apply the clock: submit on timeout, skip expired per-question slots.
export async function sync(ctx: Ctx, now: Date) {
  if (ctx.attempt.submitted_at) return
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
// still working, `at` is the latest of their deadlines: the countdown participants see.
export async function resultsStatus(session: Session): Promise<ResultsStatus> {
  if (session.is_open) return { released: false, at: null }
  await finalizeExpired(session.id)
  const last: { deadline_at: string } | null = must(
    await db()
      .from('attempts')
      .select('deadline_at')
      .eq('session_id', session.id)
      .is('submitted_at', null)
      .order('deadline_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  )
  // finalizeExpired settles an attempt only once it is more than GRACE_MS past its deadline; release
  // a second after that so the check made at the countdown's end finds nobody still working.
  return last ? { released: false, at: Date.parse(last.deadline_at) + GRACE_MS + 1000 } : { released: true, at: null }
}

export async function view(ctx: Ctx, now: Date) {
  const results = ctx.attempt.submitted_at ? await resultsStatus(ctx.session) : undefined
  return buildView(ctx.attempt, ctx.session, ctx.questions, now, results)
}

// Participants who closed the browser never trigger their own timeout; settle them for the results page.
export async function finalizeExpired(sessionId: string) {
  const cutoff = new Date(Date.now() - GRACE_MS).toISOString()
  const stale: { id: string }[] = must(
    await db().from('attempts').select('id').eq('session_id', sessionId).is('submitted_at', null).lt('deadline_at', cutoff),
  )
  await Promise.all(stale.map(async ({ id }) => sync(await loadCtx(id), new Date())))
}

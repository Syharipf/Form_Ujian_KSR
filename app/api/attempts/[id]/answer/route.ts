import { handle, readJson } from '@/lib/api'
import { finalize, loadCtx, sync, view } from '@/lib/attempts'
import { db, must } from '@/lib/db'
import { ExamError, hasStarted, originalIndex, planAnswer, type Attempt } from '@/lib/exam'

export async function POST(req: Request, ctx: RouteContext<'/api/attempts/[id]/answer'>) {
  return handle(async () => {
    const now = new Date()
    const body = await readJson(req)
    const exam = await loadCtx((await ctx.params).id)
    await sync(exam, now)
    if (exam.attempt.submitted_at) return view(exam, now)
    if (!hasStarted(exam.session, now.getTime())) throw new ExamError(409, 'Ujian belum dimulai')

    const questionId = String(body.question_id ?? '')
    const { expectIndex, nextIndex } = planAnswer(exam.attempt, exam.session, questionId)
    const choice = originalIndex(exam.attempt, questionId, Number(body.choice))
    const rows: Attempt[] = must(
      await db().rpc('record_answer', {
        p_attempt: exam.attempt.id,
        p_question: questionId,
        p_choice: choice,
        p_expect_index: expectIndex,
        p_next_index: nextIndex,
        p_now: now.toISOString(),
      }),
    )
    if (!rows.length) throw new ExamError(409, 'Jawaban tidak tersimpan, silakan coba lagi')
    exam.attempt = rows[0]
    if (exam.attempt.current_index >= exam.attempt.question_order.length) await finalize(exam, 'manual', now)
    return view(exam, now)
  })
}

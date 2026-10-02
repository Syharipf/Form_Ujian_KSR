import { handle } from '@/lib/api'
import { finalize, loadCtx, sync, view } from '@/lib/attempts'
import { ExamError, hasStarted } from '@/lib/exam'

export async function POST(_req: Request, ctx: RouteContext<'/api/attempts/[id]/submit'>) {
  return handle(async () => {
    const now = new Date()
    const exam = await loadCtx((await ctx.params).id)
    await sync(exam, now)
    if (!exam.attempt.submitted_at) {
      if (!hasStarted(exam.session, now.getTime())) throw new ExamError(409, 'Ujian belum dimulai')
      await finalize(exam, 'manual', now)
    }
    return view(exam, now)
  })
}

import { handle } from '@/lib/api'
import { finalize, loadCtx, sync, view } from '@/lib/attempts'

export async function POST(_req: Request, ctx: RouteContext<'/api/attempts/[id]/submit'>) {
  return handle(async () => {
    const now = new Date()
    const exam = await loadCtx((await ctx.params).id)
    await sync(exam, now)
    if (!exam.attempt.submitted_at) await finalize(exam, 'manual', now)
    return view(exam, now)
  })
}

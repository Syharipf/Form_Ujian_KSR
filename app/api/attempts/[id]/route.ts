import { handle } from '@/lib/api'
import { loadCtx, sync, view } from '@/lib/attempts'

export async function GET(_req: Request, ctx: RouteContext<'/api/attempts/[id]'>) {
  return handle(async () => {
    const now = new Date()
    const exam = await loadCtx((await ctx.params).id)
    await sync(exam, now)
    return view(exam, now)
  })
}

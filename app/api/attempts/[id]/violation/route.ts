import { handle, readJson } from '@/lib/api'
import { finalize, loadCtx, sync, view } from '@/lib/attempts'
import { db, must } from '@/lib/db'

export async function POST(req: Request, ctx: RouteContext<'/api/attempts/[id]/violation'>) {
  return handle(async () => {
    const now = new Date()
    const body = await readJson(req)
    const exam = await loadCtx((await ctx.params).id)
    await sync(exam, now)
    if (exam.attempt.submitted_at) return view(exam, now)

    const type = String(body.type ?? 'unknown').slice(0, 40)
    const count: number | null = must(await db().rpc('add_violation', { p_attempt: exam.attempt.id, p_type: type }))
    if (count !== null) exam.attempt.violation_count = count
    if (exam.attempt.violation_count >= exam.session.max_violations) await finalize(exam, 'violation', now)
    return view(exam, now)
  })
}

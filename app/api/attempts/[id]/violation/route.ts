import { handle, readJson } from '@/lib/api'
import { finalize, loadCtx, sync, view } from '@/lib/attempts'
import { db, must } from '@/lib/db'
import { ExamError } from '@/lib/exam'

// What use-anti-cheat.ts and the exam page report. Anything else is a crafted request.
const TYPES = new Set(['hidden', 'blur', 'fullscreen_exit', 'resize', 'reopen'])

export async function POST(req: Request, ctx: RouteContext<'/api/attempts/[id]/violation'>) {
  return handle(async () => {
    const now = new Date()
    const type = String((await readJson(req)).type)
    if (!TYPES.has(type)) throw new ExamError(400, 'Jenis pelanggaran tidak valid')
    const exam = await loadCtx((await ctx.params).id)
    await sync(exam, now)
    if (exam.attempt.submitted_at) return view(exam, now)

    const count: number | null = must(await db().rpc('add_violation', { p_attempt: exam.attempt.id, p_type: type }))
    if (count !== null) exam.attempt.violation_count = count
    if (exam.attempt.violation_count >= exam.session.max_violations) await finalize(exam, 'violation', now)
    return view(exam, now)
  })
}

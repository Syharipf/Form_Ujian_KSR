import { handle, readJson } from '@/lib/api'
import { db, must } from '@/lib/db'
import { buildOrder, deadlineFor, ExamError, type Question, type Session } from '@/lib/exam'

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req)
    const code = String(body.code ?? '').trim().toUpperCase()
    const name = String(body.name ?? '').trim()
    const nim = String(body.nim ?? '').trim()
    if (!name || name.length > 100) throw new ExamError(400, 'Nama wajib diisi (maks. 100 karakter)')
    if (!nim || nim.length > 30) throw new ExamError(400, 'NIM wajib diisi (maks. 30 karakter)')

    const session: Session | null = must(await db().from('exam_sessions').select('*').eq('code', code).maybeSingle())
    if (!session?.is_open) throw new ExamError(403, 'Sesi tidak ditemukan atau sudah ditutup')
    const questions: Question[] = must(await db().from('questions').select('*').eq('session_id', session.id))
    if (!questions.length) throw new ExamError(400, 'Soal belum tersedia. Hubungi panitia.')

    const now = new Date()
    const { data, error } = await db()
      .from('attempts')
      .insert({
        session_id: session.id,
        name,
        nim,
        ...buildOrder(questions),
        started_at: now.toISOString(),
        question_started_at: now.toISOString(),
        deadline_at: deadlineFor(session, questions.length, now).toISOString(),
      })
      .select('id')
      .single()
    if (error?.code === '23505') throw new ExamError(409, 'NIM ini sudah memulai ujian di sesi ini. Hubungi panitia.')
    if (error) throw error
    return { id: data.id }
  })
}

import { handle, readJson } from '@/lib/api'
import { db, must } from '@/lib/db'
import { buildOrder, ExamError, isOpen, timing, type Question, type Session } from '@/lib/exam'

export async function POST(req: Request) {
  return handle(async () => {
    const now = new Date()
    const body = await readJson(req)
    const code = String(body.code ?? '').trim().toUpperCase()
    const name = String(body.name ?? '').trim()
    const nim = String(body.nim ?? '').trim()
    const prodi = String(body.prodi ?? '').trim()
    if (!name || name.length > 100) throw new ExamError(400, 'Nama wajib diisi (maks. 100 karakter)')
    if (!nim || nim.length > 30) throw new ExamError(400, 'NIM wajib diisi (maks. 30 karakter)')
    if (!prodi || prodi.length > 100) throw new ExamError(400, 'Prodi wajib diisi (maks. 100 karakter)')

    const session: (Session & { questions: Question[] }) | null = must(
      await db().from('exam_sessions').select('*, questions(*)').eq('code', code).maybeSingle(),
    )
    if (!session || !isOpen(session)) throw new ExamError(403, 'Sesi tidak ditemukan atau sudah ditutup')
    const { questions } = session
    if (!questions.length) throw new ExamError(400, 'Soal belum tersedia. Hubungi panitia.')

    // Latecomers start from the session's start, so they get only the time left. In the lobby the clock
    // is a placeholder from now, re-timed by "Mulai ujian".
    const start = session.started_at ? new Date(session.started_at) : now
    const { data, error } = await db()
      .from('attempts')
      .insert({
        session_id: session.id,
        name,
        nim,
        prodi,
        ...buildOrder(questions),
        ...timing(session, questions.length, start),
      })
      .select('id')
      .single()
    if (error?.code === '23505') throw new ExamError(409, 'NIM ini sudah memulai ujian di sesi ini. Hubungi panitia.')
    if (error) throw error
    return { id: data.id }
  })
}

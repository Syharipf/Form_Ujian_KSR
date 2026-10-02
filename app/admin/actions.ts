'use server'

import { randomInt } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin-auth'
import { COOKIE, makeToken, passwordMatches, TTL_MS } from '@/lib/admin-token'
import { parseQuestionsCsv, toQuestion } from '@/lib/csv'
import { finishRound } from '@/lib/attempts'
import { db, must } from '@/lib/db'
import { deadlineFor, isOpen, START_DELAY_MS, timing, type Session } from '@/lib/exam'

const back = (id: string, msg: string) => redirect(`/admin/sessions/${id}?msg=${encodeURIComponent(msg)}`)

export async function login(formData: FormData) {
  if (!passwordMatches(String(formData.get('password') ?? ''))) {
    await new Promise((r) => setTimeout(r, 1000)) // slow down guessing
    redirect('/admin/login?error=1')
  }
  ;(await cookies()).set(COOKIE, makeToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_MS / 1000,
  })
  redirect('/admin')
}

export async function logout() {
  ;(await cookies()).delete(COOKIE)
  redirect('/admin/login')
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O, 1/I
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('')

function sessionFields(f: FormData) {
  const int = (key: string, min: number, max: number) => {
    const n = Number(f.get(key))
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${key} harus ${min}-${max}`)
    return n
  }
  const title = String(f.get('title') ?? '').trim()
  const kind = String(f.get('kind'))
  const timer_mode = String(f.get('timer_mode'))
  const held_on = String(f.get('held_on') ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(held_on) || Number.isNaN(Date.parse(held_on))) throw new Error('Tanggal sesi tidak valid')
  if (!title || title.length > 120 || !['pre', 'post'].includes(kind) || !['total', 'per_question'].includes(timer_mode)) {
    throw new Error('Data sesi tidak valid')
  }
  // Only the chosen mode's time: the form disables (so doesn't send) the other, which keeps its stored value.
  const time: Partial<Pick<Session, 'duration_sec' | 'per_question_sec'>> =
    timer_mode === 'total' ? { duration_sec: int('duration_min', 1, 600) * 60 } : { per_question_sec: int('per_question_sec', 5, 600) }
  return { title, held_on, kind, timer_mode, ...time, max_violations: int('max_violations', 1, 20) }
}

export async function createSession(formData: FormData) {
  await requireAdmin()
  const fields = sessionFields(formData)
  for (let i = 0; i < 5; i++) {
    const { data, error } = await db().from('exam_sessions').insert({ ...fields, code: newCode() }).select('id').single()
    if (error?.code === '23505') continue // code collision, try another
    if (error) throw error
    redirect(`/admin/sessions/${data.id}`)
  }
  throw new Error('Gagal membuat kode sesi unik')
}

export async function updateSession(id: string, formData: FormData) {
  await requireAdmin()
  const fields = sessionFields(formData)
  // The shared clock and attempts use the current settings (deadlines, per-question order);
  // changing them underneath would move deadlines or let per-question takers go back.
  if (await isLocked(id)) {
    const current: Pick<Session, TimerField> = must(await db().from('exam_sessions').select(TIMER_FIELDS.join(',')).eq('id', id).single())
    if (TIMER_FIELDS.some((key) => key in fields && fields[key] !== current[key])) return back(id, TIMER_LOCKED)
  }
  must(await db().from('exam_sessions').update(fields).eq('id', id))
  back(id, 'Pengaturan tersimpan')
}

type TimerRow = Pick<Session, TimerField | 'is_open' | 'closes_at' | 'started_at'> & { questions: { count: number }[] }
const timerRow = async (id: string): Promise<TimerRow> =>
  must(await db().from('exam_sessions').select('is_open, closes_at, started_at, timer_mode, duration_sec, per_question_sec, questions(count)').eq('id', id).single())

// Opening a new session (or one whose exam is over) opens the lobby: participants join and wait for
// "Mulai ujian". Reopening an exam still running lets latecomers in for the time left.
export async function setOpen(id: string, open: boolean) {
  await requireAdmin()
  const fields: Partial<Session> = { is_open: open, closes_at: null }
  if (open) {
    const s = await timerRow(id)
    const end = s.started_at && deadlineFor(s, s.questions[0]?.count ?? 0, new Date(s.started_at))
    if (end && end.getTime() > Date.now()) fields.closes_at = end.toISOString()
    else if (s.started_at) {
      await finishRound(id) // finish the last round's leftovers before clearing its clock
      fields.started_at = null
    }
    const update = db().from('exam_sessions').update(fields).eq('id', id)
    const opened = must(await (s.started_at === null ? update.is('started_at', null) : update.eq('started_at', s.started_at)).select('id'))
    if (!opened.length) return back(id, 'Status sesi berubah — muat ulang halaman lalu coba lagi')
  } else {
    must(await db().from('exam_sessions').update(fields).eq('id', id))
  }
  back(id, open ? 'Sesi dibuka' : 'Sesi ditutup')
}

// Starts every participant's clock at the same moment, START_DELAY_MS from now (see lib/exam.ts).
export async function startExam(id: string) {
  await requireAdmin()
  const s = await timerRow(id)
  const count = s.questions[0]?.count ?? 0
  if (!isOpen(s) || s.started_at) return back(id, 'Ujian hanya bisa dimulai saat sesi dibuka dan belum dimulai')
  if (!count) return back(id, 'Belum ada soal')
  const clock = timing(s, count, new Date(Date.now() + START_DELAY_MS))
  const started = must(
    await db().from('exam_sessions').update({ started_at: clock.started_at, closes_at: clock.deadline_at }).eq('id', id).is('started_at', null).select('id'),
  )
  if (!started.length) return back(id, 'Ujian sudah dimulai')
  // Lobby attempts carry placeholder clocks from their join; a join landing after this is re-timed by sync().
  must(await db().from('attempts').update(clock).eq('session_id', id).is('submitted_at', null).lt('started_at', clock.started_at))
  back(id, 'Ujian dimulai')
}

// Questions, attempts and violations go with it (on delete cascade).
export async function deleteSession(id: string) {
  await requireAdmin()
  must(await db().from('exam_sessions').delete().eq('id', id))
  redirect('/admin')
}

// Attempts reference question ids and option counts; a started exam's clock also depends on the settings.
async function isLocked(sessionId: string) {
  const { count, error } = await db().from('attempts').select('id', { count: 'exact', head: true }).eq('session_id', sessionId)
  if (error) throw error
  if (count) return true
  const session: Pick<Session, 'started_at'> = must(await db().from('exam_sessions').select('started_at').eq('id', sessionId).single())
  return session.started_at !== null
}
const LOCKED = 'Sudah ada peserta atau ujian sudah dimulai. Reset semua peserta dulu sebelum mengubah soal.'
const TIMER_FIELDS = ['timer_mode', 'duration_sec', 'per_question_sec'] as const
type TimerField = (typeof TIMER_FIELDS)[number]
const TIMER_LOCKED = 'Pengaturan belum tersimpan — timer terkunci karena sudah ada peserta atau ujian sudah dimulai. Reset semua peserta dulu untuk mengubah timer.'

export async function uploadQuestions(id: string, formData: FormData) {
  await requireAdmin()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return back(id, 'Pilih file CSV dulu')
  const bytes = new Uint8Array(await file.arrayBuffer())
  // .xlsx/.xls are binary (zip / OLE); parsing them as text only yields confusing row errors.
  if ((bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes[0] === 0xd0 && bytes[1] === 0xcf)) {
    return back(id, 'Ini file Excel, bukan CSV. Di Excel/Google Sheets pilih Save As / Download → CSV, lalu upload file .csv-nya.')
  }
  const { questions, errors } = parseQuestionsCsv(new TextDecoder().decode(bytes))
  if (errors.length) return back(id, `Upload gagal — ${errors.slice(0, 5).join(' · ')}`)
  if (!questions.length) return back(id, 'File tidak berisi soal')
  if (await isLocked(id)) return back(id, LOCKED)

  must(await db().from('questions').delete().eq('session_id', id))
  must(await db().from('questions').insert(questions.map((q) => ({ ...q, session_id: id }))))
  back(id, `${questions.length} soal tersimpan`)
}

// Add (questionId null) or edit one question from the manual form.
export async function saveQuestion(sessionId: string, questionId: string | null, formData: FormData) {
  await requireAdmin()
  const field = (key: string) => {
    const value = formData.get(key)
    return typeof value === 'string' ? value : ''
  }
  const q = toQuestion({ type: field('type'), text: field('question'), options: ['a', 'b', 'c', 'd', 'e'].map(field), answer: field('answer') })
  if (typeof q === 'string') return back(sessionId, `Soal belum tersimpan — ${q}`)
  if (await isLocked(sessionId)) return back(sessionId, LOCKED)

  if (questionId) {
    must(await db().from('questions').update(q).eq('id', questionId).eq('session_id', sessionId))
    return back(sessionId, 'Soal diperbarui')
  }
  const last: { position: number } | null = must(
    await db().from('questions').select('position').eq('session_id', sessionId).order('position', { ascending: false }).limit(1).maybeSingle(),
  )
  must(await db().from('questions').insert({ ...q, session_id: sessionId, position: (last?.position ?? -1) + 1 }))
  back(sessionId, 'Soal ditambahkan')
}

export async function deleteQuestion(sessionId: string, questionId: string) {
  await requireAdmin()
  if (await isLocked(sessionId)) return back(sessionId, LOCKED)
  must(await db().from('questions').delete().eq('id', questionId).eq('session_id', sessionId))
  back(sessionId, 'Soal dihapus')
}

export async function resetAttempt(sessionId: string, attemptId: string) {
  await requireAdmin()
  must(await db().from('attempts').delete().eq('id', attemptId).eq('session_id', sessionId))
  back(sessionId, 'Peserta direset dan bisa mulai ulang')
}

export async function resetAllAttempts(sessionId: string) {
  await requireAdmin()
  must(await db().from('exam_sessions').update({ started_at: null, closes_at: null }).eq('id', sessionId)) // a fresh lobby
  must(await db().from('attempts').delete().eq('session_id', sessionId))
  back(sessionId, 'Semua peserta direset')
}

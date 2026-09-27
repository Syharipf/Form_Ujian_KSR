'use server'

import { randomInt } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin-auth'
import { COOKIE, makeToken, passwordMatches, TTL_MS } from '@/lib/admin-token'
import { parseQuestionsCsv, toQuestion } from '@/lib/csv'
import { db, must } from '@/lib/db'

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
  if (!title || title.length > 120 || !['pre', 'post'].includes(kind) || !['total', 'per_question'].includes(timer_mode)) {
    throw new Error('Data sesi tidak valid')
  }
  return {
    title,
    kind,
    timer_mode,
    duration_sec: int('duration_min', 1, 600) * 60,
    per_question_sec: int('per_question_sec', 5, 600),
    max_violations: int('max_violations', 1, 20),
  }
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
  must(await db().from('exam_sessions').update(sessionFields(formData)).eq('id', id))
  back(id, 'Pengaturan tersimpan')
}

export async function setOpen(id: string, open: boolean) {
  await requireAdmin()
  must(await db().from('exam_sessions').update({ is_open: open }).eq('id', id))
  back(id, open ? 'Sesi dibuka' : 'Sesi ditutup')
}

// Attempts reference question ids and option counts; changing questions under them would break grading.
async function hasAttempts(sessionId: string) {
  const { count, error } = await db().from('attempts').select('id', { count: 'exact', head: true }).eq('session_id', sessionId)
  if (error) throw error
  return Boolean(count)
}
const LOCKED = 'Sudah ada peserta. Reset semua peserta dulu sebelum mengubah soal.'

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
  if (await hasAttempts(id)) return back(id, LOCKED)

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
  if (await hasAttempts(sessionId)) return back(sessionId, LOCKED)

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
  if (await hasAttempts(sessionId)) return back(sessionId, LOCKED)
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
  must(await db().from('attempts').delete().eq('session_id', sessionId))
  back(sessionId, 'Semua peserta direset')
}

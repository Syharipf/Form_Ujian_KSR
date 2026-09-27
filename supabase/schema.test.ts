import { beforeEach, describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

// Runs schema.sql on an in-memory Postgres to check the SQL and both RPC functions.
const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')
let db: PGlite
let attemptId: string
let q1: string
let q2: string

beforeEach(async () => {
  db = new PGlite()
  await db.exec('create role anon; create role authenticated; create role service_role;')
  await db.exec(schema)
  const { rows } = await db.query<{ id: string }>(
    `insert into exam_sessions (code, title, kind, timer_mode) values ('T1', 'Tes', 'pre', 'per_question') returning id`,
  )
  const sessionId = rows[0].id
  const qs = await db.query<{ id: string }>(
    `insert into questions (session_id, position, type, text, options, answer_index)
     values ($1, 0, 'mc', 'a', '{x,y}', 1), ($1, 1, 'tf', 'b', '{Benar,Salah}', 0) returning id`,
    [sessionId],
  )
  ;[q1, q2] = qs.rows.map((r) => r.id)
  const a = await db.query<{ id: string }>(
    `insert into attempts (session_id, name, nim, question_order, option_orders, question_started_at, started_at, deadline_at)
     values ($1, 'Ani', '1', $2, '{}', now(), now(), now() + interval '1 hour') returning id`,
    [sessionId, [q1, q2]],
  )
  attemptId = a.rows[0].id
})

const recordAnswer = (question: string, choice: number, expect: number, next: number) =>
  db.query<{ current_index: number; answers: Record<string, number> }>(
    'select * from record_answer($1, $2, $3, $4, $5, now())',
    [attemptId, question, choice, expect, next],
  )

describe('schema.sql', () => {
  it('record_answer merges answers and advances only from the expected index', async () => {
    const first = await recordAnswer(q1, 1, 0, 1)
    expect(first.rows[0].current_index).toBe(1)
    const stale = await recordAnswer(q1, 0, 0, 1)
    expect(stale.rows).toEqual([])
    const second = await recordAnswer(q2, 0, 1, 2)
    expect(second.rows[0].answers).toEqual({ [q1]: 1, [q2]: 0 })
  })

  it('add_violation counts and logs until the attempt is submitted', async () => {
    const add = () => db.query<{ n: number | null }>('select add_violation($1, $2) as n', [attemptId, 'blur'])
    expect((await add()).rows[0].n).toBe(1)
    expect((await add()).rows[0].n).toBe(2)
    await db.query('update attempts set submitted_at = now() where id = $1', [attemptId])
    expect((await add()).rows[0].n).toBeNull()
    const logged = await db.query('select * from violations where attempt_id = $1', [attemptId])
    expect(logged.rows.length).toBe(2)
  })

  it('rejects a duplicate NIM in the same session and an out-of-range answer key', async () => {
    const dup = db.query(
      `insert into attempts (session_id, name, nim, question_order, option_orders, question_started_at, started_at, deadline_at)
       select session_id, 'Ani lagi', '1', question_order, '{}', now(), now(), now() from attempts where id = $1`,
      [attemptId],
    )
    await expect(dup).rejects.toThrow(/duplicate key/)
    const bad = db.query(
      `insert into questions (session_id, position, type, text, options, answer_index)
       select session_id, 9, 'mc', 'x', '{a,b}', 2 from attempts where id = $1`,
      [attemptId],
    )
    await expect(bad).rejects.toThrow(/check constraint/)
  })
})

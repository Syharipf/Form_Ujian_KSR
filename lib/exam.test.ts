import { describe, expect, it } from 'bun:test'
import {
  buildOrder,
  buildView,
  deadlineFor,
  ExamError,
  grade,
  GRACE_MS,
  originalIndex,
  planAnswer,
  settle,
  shuffle,
  type Attempt,
  type Question,
  type Session,
} from './exam'

function seeded(seed = 1) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const q = (id: string, type: 'mc' | 'tf', answer_index: number): Question => ({
  id,
  session_id: 's',
  position: 0,
  type,
  text: `Soal ${id}`,
  options: type === 'tf' ? ['Benar', 'Salah'] : ['A', 'B', 'C', 'D'],
  answer_index,
})

const session = (over: Partial<Session> = {}): Session => ({
  id: 's',
  code: 'ABC123',
  title: 'Pre-test',
  kind: 'pre',
  timer_mode: 'total',
  duration_sec: 600,
  per_question_sec: 30,
  max_violations: 3,
  is_open: true,
  ...over,
})

const T0 = Date.parse('2026-01-01T00:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()

const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  id: 'a',
  session_id: 's',
  name: 'Budi',
  nim: '123',
  question_order: ['q1', 'q2', 'q3'],
  option_orders: { q1: [2, 0, 1, 3], q2: [0, 1], q3: [3, 2, 1, 0] },
  answers: {},
  current_index: 0,
  question_started_at: iso(T0),
  started_at: iso(T0),
  deadline_at: iso(T0 + 600_000),
  submitted_at: null,
  submit_reason: null,
  score: null,
  violation_count: 0,
  ...over,
})

const questions = { q1: q('q1', 'mc', 0), q2: q('q2', 'tf', 1), q3: q('q3', 'mc', 3) }

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const input = [1, 2, 3, 4, 5, 6]
    const out = shuffle(input, seeded())
    expect([...out].sort()).toEqual(input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('buildOrder', () => {
  it('shuffles questions and mc options, keeps tf options fixed', () => {
    const { question_order, option_orders } = buildOrder([q('q1', 'mc', 0), q('q2', 'tf', 0), q('q3', 'mc', 1)], seeded(7))
    expect([...question_order].sort()).toEqual(['q1', 'q2', 'q3'])
    expect(option_orders.q2).toEqual([0, 1])
    expect([...option_orders.q1].sort()).toEqual([0, 1, 2, 3])
  })
})

describe('originalIndex', () => {
  it('maps a display index to the original option index', () => {
    expect(originalIndex(attempt(), 'q1', 0)).toBe(2)
    expect(originalIndex(attempt(), 'q3', 3)).toBe(0)
  })

  it('rejects out-of-range or unknown choices', () => {
    expect(() => originalIndex(attempt(), 'q1', 4)).toThrow(ExamError)
    expect(() => originalIndex(attempt(), 'q1', 1.5)).toThrow(ExamError)
    expect(() => originalIndex(attempt(), 'zz', 0)).toThrow(ExamError)
  })
})

describe('grade', () => {
  it('scores original indices against the key, rounded to 0-100', () => {
    expect(grade(attempt({ answers: { q1: 0, q2: 1 } }), questions)).toBe(67)
    expect(grade(attempt({ answers: { q1: 0, q2: 1, q3: 3 } }), questions)).toBe(100)
    expect(grade(attempt({ answers: { q1: 1 } }), questions)).toBe(0)
    expect(grade(attempt({ question_order: [] }), questions)).toBe(0)
  })
})

describe('deadlineFor', () => {
  it('uses the duration in total mode and n × per-question time otherwise', () => {
    expect(deadlineFor(session(), 10, new Date(T0)).getTime()).toBe(T0 + 600_000)
    expect(deadlineFor(session({ timer_mode: 'per_question' }), 10, new Date(T0)).getTime()).toBe(T0 + 300_000)
  })
})

describe('settle', () => {
  it('total mode finishes only after deadline + grace', () => {
    expect(settle(attempt(), session(), new Date(T0 + 600_000 + GRACE_MS - 1)).finish).toBeNull()
    expect(settle(attempt(), session(), new Date(T0 + 600_000 + GRACE_MS)).finish).toBe('timeout')
  })

  it('per-question mode skips expired questions and times out past the last one', () => {
    const s = session({ timer_mode: 'per_question' })
    const r = settle(attempt(), s, new Date(T0 + 65_000 + GRACE_MS))
    expect(r).toEqual({ current_index: 2, question_started_at: iso(T0 + 60_000), finish: null })
    expect(settle(attempt(), s, new Date(T0 + 90_000 + GRACE_MS)).finish).toBe('timeout')
  })
})

describe('planAnswer', () => {
  it('per-question mode accepts only the current question and advances', () => {
    const s = session({ timer_mode: 'per_question' })
    expect(planAnswer(attempt({ current_index: 1 }), s, 'q2')).toEqual({ expectIndex: 1, nextIndex: 2 })
    expect(() => planAnswer(attempt({ current_index: 1 }), s, 'q1')).toThrow(ExamError)
  })

  it('total mode accepts any question of the attempt without moving', () => {
    expect(planAnswer(attempt(), session(), 'q3')).toEqual({ expectIndex: 0, nextIndex: 0 })
    expect(() => planAnswer(attempt(), session(), 'zz')).toThrow(ExamError)
  })
})

describe('buildView', () => {
  it('shows only the current question in per-question mode and never the answer key', () => {
    const v = buildView(attempt({ current_index: 1 }), session({ timer_mode: 'per_question' }), questions, new Date(T0))
    expect(v.questions).toEqual([{ id: 'q2', type: 'tf', text: 'Soal q2', options: ['Benar', 'Salah'] }])
    expect(v.question_deadline_at).toBe(T0 + 30_000)
    expect(JSON.stringify(v)).not.toContain('answer_index')
    expect(JSON.stringify(v)).not.toContain('score')
  })

  it('total mode shows all questions in display order with answers as display indices', () => {
    const v = buildView(attempt({ answers: { q1: 2 } }), session(), questions, new Date(T0))
    expect(v.questions.map((x) => x.id)).toEqual(['q1', 'q2', 'q3'])
    expect(v.questions[0].options).toEqual(['C', 'A', 'B', 'D'])
    expect(v.answers).toEqual({ q1: 0 })
    expect(v.question_deadline_at).toBeNull()
  })

  it('exposes no questions once submitted, and the score only when released', () => {
    const done = attempt({ submitted_at: iso(T0), submit_reason: 'manual', score: 50 })
    const v = buildView(done, session(), questions, new Date(T0))
    expect(v.status).toBe('submitted')
    expect(v.questions).toEqual([])
    expect(JSON.stringify(v)).not.toContain('score')
    expect(buildView(done, session(), questions, new Date(T0), true).score).toBe(50)
    // an unfinished attempt never carries a score, even if the caller says released
    expect(JSON.stringify(buildView(attempt({ score: 50 }), session(), questions, new Date(T0), true))).not.toContain('score')
  })
})

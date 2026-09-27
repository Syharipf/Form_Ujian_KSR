import { describe, expect, it } from 'bun:test'
import { compareScores } from './report'

describe('compareScores', () => {
  it('joins pre and post by NIM, computes deltas and averages', () => {
    const r = compareScores(
      [
        { name: 'Ani', nim: '1', score: 40 },
        { name: 'Budi', nim: 'x2', score: 60 },
        { name: 'Cici', nim: '3', score: null },
      ],
      [
        { name: 'Ani', nim: ' 1 ', score: 80 },
        { name: 'Budi', nim: 'X2', score: 70 },
        { name: 'Dodi', nim: '4', score: 90 },
      ],
    )
    expect(r.rows).toEqual([
      { nim: '1', name: 'Ani', pre: 40, post: 80, delta: 40 },
      { nim: 'x2', name: 'Budi', pre: 60, post: 70, delta: 10 },
      { nim: '3', name: 'Cici', pre: null, post: null, delta: null },
      { nim: '4', name: 'Dodi', pre: null, post: 90, delta: null },
    ])
    expect(r.avgPre).toBe(50)
    expect(r.avgPost).toBe(80)
    expect(r.avgDelta).toBe(25)
  })

  it('returns null averages when there is nothing to average', () => {
    expect(compareScores([], [])).toEqual({ rows: [], avgPre: null, avgPost: null, avgDelta: null })
  })
})

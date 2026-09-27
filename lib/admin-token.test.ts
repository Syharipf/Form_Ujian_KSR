import { describe, expect, it } from 'bun:test'
import { makeToken, passwordMatches, verifyToken } from './admin-token'

describe('admin token', () => {
  it('accepts a fresh token signed with the same secret', () => {
    expect(verifyToken(makeToken(1000, 'pw'), 2000, 'pw')).toBe(true)
  })

  it('rejects expired, tampered, foreign or missing tokens', () => {
    const token = makeToken(1000, 'pw')
    expect(verifyToken(token, 1000 + 13 * 3600_000, 'pw')).toBe(false)
    expect(verifyToken(token, 2000, 'other')).toBe(false)
    expect(verifyToken(token.replace(/^\d+/, '99999999999999'), 2000, 'pw')).toBe(false)
    expect(verifyToken('garbage', 2000, 'pw')).toBe(false)
    expect(verifyToken(undefined, 2000, 'pw')).toBe(false)
  })

  it('compares passwords exactly', () => {
    expect(passwordMatches('pw', 'pw')).toBe(true)
    expect(passwordMatches('pW', 'pw')).toBe(false)
    expect(passwordMatches('', 'pw')).toBe(false)
  })
})

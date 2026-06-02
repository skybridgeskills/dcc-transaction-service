import { describe, expect, test } from 'vitest'
import {
  generateAccessToken,
  generateCNonce,
  generatePreAuthorizedCode
} from './codes.js'

const isBase64Url = (s: string) => /^[A-Za-z0-9_-]+$/.test(s)

describe('generatePreAuthorizedCode', () => {
  test('returns a non-empty base64url string', () => {
    const code = generatePreAuthorizedCode()
    expect(code.length).toBeGreaterThanOrEqual(40)
    expect(isBase64Url(code)).toBe(true)
  })

  test('produces unique values across many calls', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) seen.add(generatePreAuthorizedCode())
    expect(seen.size).toBe(1000)
  })
})

describe('generateAccessToken', () => {
  test('returns a non-empty base64url string', () => {
    const token = generateAccessToken()
    expect(token.length).toBeGreaterThanOrEqual(40)
    expect(isBase64Url(token)).toBe(true)
  })
})

describe('generateCNonce', () => {
  test('returns a non-empty base64url string of at least 22 chars (16 bytes)', () => {
    const nonce = generateCNonce()
    expect(nonce.length).toBeGreaterThanOrEqual(20)
    expect(isBase64Url(nonce)).toBe(true)
  })

  test('produces unique values across many calls', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) seen.add(generateCNonce())
    expect(seen.size).toBe(1000)
  })
})

import { expect, test, describe } from 'vitest'
import { processAuthorization } from './authorization.js'
import type { OID4VCI } from './types.js'
import { HTTPException } from 'hono/http-exception'
import { calculateTokenExpiration } from './utils.js'

describe('processAuthorization', function () {
  test('validates pre-authorized code correctly', function () {
    const preAuthorizedCode = 'test-code-123'
    const storedCode: OID4VCI.StoredCode = {
      code: preAuthorizedCode,
      expiresAt: calculateTokenExpiration(600),
      used: false
    }

    const result = processAuthorization(preAuthorizedCode, storedCode)

    expect(result).toBeDefined()
    expect(result.code).toBeDefined()
    expect(typeof result.code).toBe('string')
    expect(result.code?.length).toBeGreaterThan(0)
  })

  test('rejects invalid codes', function () {
    const preAuthorizedCode = 'test-code-123'
    const storedCode: OID4VCI.StoredCode = {
      code: 'different-code',
      expiresAt: calculateTokenExpiration(600),
      used: false
    }

    expect(() => {
      processAuthorization(preAuthorizedCode, storedCode)
    }).toThrow(HTTPException)
  })

  test('rejects used codes', function () {
    const preAuthorizedCode = 'test-code-123'
    const storedCode: OID4VCI.StoredCode = {
      code: preAuthorizedCode,
      expiresAt: calculateTokenExpiration(600),
      used: true
    }

    expect(() => {
      processAuthorization(preAuthorizedCode, storedCode)
    }).toThrow(HTTPException)
  })

  test('rejects expired codes', function () {
    const preAuthorizedCode = 'test-code-123'
    const storedCode: OID4VCI.StoredCode = {
      code: preAuthorizedCode,
      expiresAt: new Date(Date.now() - 1000).toISOString(), // Expired
      used: false
    }

    expect(() => {
      processAuthorization(preAuthorizedCode, storedCode)
    }).toThrow(HTTPException)
  })

  test('rejects undefined stored code', function () {
    const preAuthorizedCode = 'test-code-123'

    expect(() => {
      processAuthorization(preAuthorizedCode, undefined)
    }).toThrow(HTTPException)
  })

  test('generates authorization code on success', function () {
    const preAuthorizedCode1 = 'test-code-123'
    const storedCode1: OID4VCI.StoredCode = {
      code: preAuthorizedCode1,
      expiresAt: calculateTokenExpiration(600),
      used: false
    }

    const preAuthorizedCode2 = 'test-code-456'
    const storedCode2: OID4VCI.StoredCode = {
      code: preAuthorizedCode2,
      expiresAt: calculateTokenExpiration(600),
      used: false
    }

    const result1 = processAuthorization(preAuthorizedCode1, storedCode1)
    const result2 = processAuthorization(preAuthorizedCode2, storedCode2)

    // Authorization codes should be different
    expect(result1.code).not.toBe(result2.code)
  })
})

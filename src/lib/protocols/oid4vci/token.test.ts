import {
  generateTokenForPreAuthorizedCode,
  generateTokenForAuthorizationCode
} from './token.js'
import type { OID4VCI } from './types.js'
import { HttpError } from '../../http-error.js'
import { calculateTokenExpiration } from './utils.js'

describe('generateTokenForPreAuthorizedCode', function () {
  test('validates pre-authorized code', function () {
    const preAuthorizedCode = 'test-code-123'
    const storedCode: OID4VCI.StoredCode = {
      code: preAuthorizedCode,
      expiresAt: calculateTokenExpiration(600),
      used: false
    }

    const result = generateTokenForPreAuthorizedCode(
      preAuthorizedCode,
      storedCode
    )

    expect(result).toBeDefined()
    expect(result.access_token).toBeDefined()
    expect(result.token_type).toBe('Bearer')
    expect(result.expires_in).toBeDefined()
    expect(result.c_nonce).toBeDefined()
    expect(result.c_nonce_expires_in).toBeDefined()
  })

  test('generates access token and c_nonce', function () {
    const preAuthorizedCode = 'test-code-123'
    const storedCode: OID4VCI.StoredCode = {
      code: preAuthorizedCode,
      expiresAt: calculateTokenExpiration(600),
      used: false
    }

    const result = generateTokenForPreAuthorizedCode(
      preAuthorizedCode,
      storedCode
    )

    expect(typeof result.access_token).toBe('string')
    expect(result.access_token.length).toBeGreaterThan(0)
    expect(typeof result.c_nonce).toBe('string')
    expect(result.c_nonce?.length).toBeGreaterThan(0)
    expect(result.expires_in).toBe(3600)
    expect(result.c_nonce_expires_in).toBe(300)
  })

  test('rejects invalid codes', function () {
    const preAuthorizedCode = 'test-code-123'
    const storedCode: OID4VCI.StoredCode = {
      code: 'different-code',
      expiresAt: calculateTokenExpiration(600),
      used: false
    }

    expect(() => {
      generateTokenForPreAuthorizedCode(preAuthorizedCode, storedCode)
    }).toThrow(HttpError)
  })

  test('rejects used codes', function () {
    const preAuthorizedCode = 'test-code-123'
    const storedCode: OID4VCI.StoredCode = {
      code: preAuthorizedCode,
      expiresAt: calculateTokenExpiration(600),
      used: true
    }

    expect(() => {
      generateTokenForPreAuthorizedCode(preAuthorizedCode, storedCode)
    }).toThrow(HttpError)
  })

  test('rejects expired codes', function () {
    const preAuthorizedCode = 'test-code-123'
    const storedCode: OID4VCI.StoredCode = {
      code: preAuthorizedCode,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      used: false
    }

    expect(() => {
      generateTokenForPreAuthorizedCode(preAuthorizedCode, storedCode)
    }).toThrow(HttpError)
  })

  test('rejects undefined stored code', function () {
    const preAuthorizedCode = 'test-code-123'

    expect(() => {
      generateTokenForPreAuthorizedCode(preAuthorizedCode, undefined)
    }).toThrow(HttpError)
  })
})

describe('generateTokenForAuthorizationCode', function () {
  test('validates authorization code', function () {
    const authorizationCode = 'test-auth-code-123'
    const storedCode: OID4VCI.StoredCode = {
      code: authorizationCode,
      expiresAt: calculateTokenExpiration(600),
      used: false
    }

    const result = generateTokenForAuthorizationCode(
      authorizationCode,
      storedCode
    )

    expect(result).toBeDefined()
    expect(result.access_token).toBeDefined()
    expect(result.token_type).toBe('Bearer')
    expect(result.expires_in).toBeDefined()
    expect(result.c_nonce).toBeDefined()
    expect(result.c_nonce_expires_in).toBeDefined()
  })

  test('generates access token and c_nonce', function () {
    const authorizationCode = 'test-auth-code-123'
    const storedCode: OID4VCI.StoredCode = {
      code: authorizationCode,
      expiresAt: calculateTokenExpiration(600),
      used: false
    }

    const result = generateTokenForAuthorizationCode(
      authorizationCode,
      storedCode
    )

    expect(typeof result.access_token).toBe('string')
    expect(result.access_token.length).toBeGreaterThan(0)
    expect(typeof result.c_nonce).toBe('string')
    expect(result.c_nonce?.length).toBeGreaterThan(0)
    expect(result.expires_in).toBe(3600)
    expect(result.c_nonce_expires_in).toBe(300)
  })

  test('rejects invalid codes', function () {
    const authorizationCode = 'test-auth-code-123'
    const storedCode: OID4VCI.StoredCode = {
      code: 'different-code',
      expiresAt: calculateTokenExpiration(600),
      used: false
    }

    expect(() => {
      generateTokenForAuthorizationCode(authorizationCode, storedCode)
    }).toThrow(HttpError)
  })

  test('rejects used codes', function () {
    const authorizationCode = 'test-auth-code-123'
    const storedCode: OID4VCI.StoredCode = {
      code: authorizationCode,
      expiresAt: calculateTokenExpiration(600),
      used: true
    }

    expect(() => {
      generateTokenForAuthorizationCode(authorizationCode, storedCode)
    }).toThrow(HttpError)
  })

  test('rejects expired codes', function () {
    const authorizationCode = 'test-auth-code-123'
    const storedCode: OID4VCI.StoredCode = {
      code: authorizationCode,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      used: false
    }

    expect(() => {
      generateTokenForAuthorizationCode(authorizationCode, storedCode)
    }).toThrow(HttpError)
  })

  test('rejects undefined stored code', function () {
    const authorizationCode = 'test-auth-code-123'

    expect(() => {
      generateTokenForAuthorizationCode(authorizationCode, undefined)
    }).toThrow(HttpError)
  })
})

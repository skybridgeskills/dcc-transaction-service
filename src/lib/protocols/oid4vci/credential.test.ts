import { expect, test, describe } from 'vitest'
import { validateAccessToken, formatCredentialResponse } from './credential.js'
import type { OID4VCI } from './types.js'
import { HTTPException } from 'hono/http-exception'
import { calculateTokenExpiration } from './utils.js'

describe('validateAccessToken', function () {
  test('validates token matches stored token', function () {
    const accessToken = 'test-access-token-123'
    const exchangeId = 'test-exchange-123'
    const storedToken: OID4VCI.StoredToken = {
      exchangeId,
      accessToken,
      expiresAt: calculateTokenExpiration(3600),
      cNonce: 'test-c-nonce',
      cNonceExpiresAt: calculateTokenExpiration(300)
    }

    expect(() => {
      validateAccessToken(accessToken, storedToken, exchangeId)
    }).not.toThrow()
  })

  test('validates token expiration', function () {
    const accessToken = 'test-access-token-123'
    const exchangeId = 'test-exchange-123'
    const storedToken: OID4VCI.StoredToken = {
      exchangeId,
      accessToken,
      expiresAt: new Date(Date.now() - 1000).toISOString(), // Expired
      cNonce: 'test-c-nonce'
    }

    expect(() => {
      validateAccessToken(accessToken, storedToken, exchangeId)
    }).toThrow(HTTPException)
  })

  test('validates exchangeId matches', function () {
    const accessToken = 'test-access-token-123'
    const storedToken: OID4VCI.StoredToken = {
      exchangeId: 'exchange-123',
      accessToken,
      expiresAt: calculateTokenExpiration(3600)
    }

    // Try to use token for different exchange
    expect(() => {
      validateAccessToken(accessToken, storedToken, 'different-exchange')
    }).toThrow(HTTPException)
  })

  test('rejects invalid tokens', function () {
    const accessToken = 'test-access-token-123'
    const exchangeId = 'test-exchange-123'
    const storedToken: OID4VCI.StoredToken = {
      exchangeId,
      accessToken: 'different-token',
      expiresAt: calculateTokenExpiration(3600)
    }

    expect(() => {
      validateAccessToken(accessToken, storedToken, exchangeId)
    }).toThrow(HTTPException)
  })

  test('rejects undefined stored token', function () {
    const accessToken = 'test-access-token-123'
    const exchangeId = 'test-exchange-123'

    expect(() => {
      validateAccessToken(accessToken, undefined, exchangeId)
    }).toThrow(HTTPException)
  })
})

describe('formatCredentialResponse', function () {
  test('extracts credential from nested verifiablePresentation structure', function () {
    const mockCredential = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential'],
      credentialSubject: { id: 'test' }
    }

    const vcApiResponse = {
      verifiablePresentation: {
        verifiablePresentation: {
          verifiableCredential: [mockCredential]
        }
      }
    }

    const result = formatCredentialResponse(vcApiResponse)

    expect(result).toBeDefined()
    expect(result.credential).toEqual(mockCredential)
    expect(result.format).toBe('ldp_vc')
  })

  test('handles direct verifiablePresentation structure', function () {
    const mockCredential = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential'],
      credentialSubject: { id: 'test' }
    }

    const vcApiResponse = {
      verifiablePresentation: {
        verifiableCredential: [mockCredential]
      }
    }

    const result = formatCredentialResponse(vcApiResponse)

    expect(result).toBeDefined()
    expect(result.credential).toEqual(mockCredential)
  })

  test('handles direct verifiableCredential', function () {
    const mockCredential = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential'],
      credentialSubject: { id: 'test' }
    }

    const vcApiResponse = {
      verifiableCredential: [mockCredential]
    }

    const result = formatCredentialResponse(vcApiResponse)

    expect(result).toBeDefined()
    expect(result.credential).toEqual(mockCredential)
  })

  test('handles single verifiableCredential (not array)', function () {
    const mockCredential = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential'],
      credentialSubject: { id: 'test' }
    }

    const vcApiResponse = {
      verifiableCredential: mockCredential
    }

    const result = formatCredentialResponse(vcApiResponse)

    expect(result).toBeDefined()
    expect(result.credential).toEqual(mockCredential)
  })

  test('returns correct OID4VCI format', function () {
    const mockCredential = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential'],
      credentialSubject: { id: 'test' }
    }

    const vcApiResponse = {
      verifiablePresentation: {
        verifiablePresentation: {
          verifiableCredential: [mockCredential]
        }
      }
    }

    const result = formatCredentialResponse(vcApiResponse)

    expect(result).toHaveProperty('credential')
    expect(result).toHaveProperty('format')
    expect(result.format).toBe('ldp_vc')
  })

  test('uses response as fallback if credential structure not found', function () {
    const vcApiResponse = {
      someOtherProperty: 'value',
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential']
    }

    // The function uses the response itself as fallback
    const result = formatCredentialResponse(vcApiResponse)
    expect(result.credential).toEqual(vcApiResponse)
  })

  test('throws error if credential is null', function () {
    const vcApiResponse: any = null

    expect(() => {
      formatCredentialResponse(vcApiResponse)
    }).toThrow()
    // Throws TypeError when accessing properties of null
  })

  test('throws error if credential is undefined', function () {
    const vcApiResponse: any = undefined

    expect(() => {
      formatCredentialResponse(vcApiResponse)
    }).toThrow()
    // Throws TypeError when accessing properties of undefined
  })
})

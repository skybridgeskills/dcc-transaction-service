import { describe, expect, test } from 'vitest'
import {
  ensurePreAuthorizedCode,
  mintNonce,
  redeemPreAuthorizedCode,
  setAccessToken,
  validateAccessToken,
  validateAndConsumeNonce
} from './state.js'

const fixture = (
  overrides: Partial<App.ExchangeDetailClaim['variables']> = {}
): App.ExchangeDetailClaim => ({
  tenantName: 'default',
  workflowId: 'claim',
  exchangeId: 'exch-test',
  expires: new Date(Date.now() + 60_000).toISOString(),
  state: 'pending',
  variables: {
    challenge: 'chal-1',
    exchangeHost: 'https://issuer.example',
    vc: '{"type":["VerifiableCredential","OpenBadgeCredential"]}',
    ...overrides
  }
})

describe('ensurePreAuthorizedCode', () => {
  test('mints a new code on first call', () => {
    const r = ensurePreAuthorizedCode(fixture(), 600)
    expect(r.isNew).toBe(true)
    expect(r.code).toBeTruthy()
    expect(r.exchange.variables.oid4vci?.preAuthorizedCode).toBe(r.code)
    expect(r.exchange.variables.oid4vci?.codeUsed).toBe(false)
  })

  test('is idempotent while the code is unused and unexpired', () => {
    const a = ensurePreAuthorizedCode(fixture(), 600)
    const b = ensurePreAuthorizedCode(a.exchange, 600)
    expect(b.isNew).toBe(false)
    expect(b.code).toBe(a.code)
  })

  test('mints a new code if the prior one was used', () => {
    const a = ensurePreAuthorizedCode(fixture(), 600)
    const used = redeemPreAuthorizedCode(a.exchange, a.code)
    if (!used.ok) throw new Error('expected ok')
    const b = ensurePreAuthorizedCode(used.value.exchange, 600)
    expect(b.isNew).toBe(true)
    expect(b.code).not.toBe(a.code)
  })

  test('mints a new code if the prior one expired', () => {
    const a = ensurePreAuthorizedCode(fixture(), 600)
    const expiredExchange: App.ExchangeDetailClaim = {
      ...a.exchange,
      variables: {
        ...a.exchange.variables,
        oid4vci: {
          ...a.exchange.variables.oid4vci!,
          preAuthorizedCodeExpiresAt: '2000-01-01T00:00:00Z'
        }
      }
    }
    const b = ensurePreAuthorizedCode(expiredExchange, 600)
    expect(b.isNew).toBe(true)
    expect(b.code).not.toBe(a.code)
  })
})

describe('redeemPreAuthorizedCode', () => {
  test('happy path marks the code used', () => {
    const a = ensurePreAuthorizedCode(fixture(), 600)
    const r = redeemPreAuthorizedCode(a.exchange, a.code)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.exchange.variables.oid4vci?.codeUsed).toBe(true)
    }
  })

  test('returns invalid_request when no code on file', () => {
    const r = redeemPreAuthorizedCode(fixture(), 'whatever')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('invalid_request')
  })

  test('returns invalid_grant for a wrong code', () => {
    const a = ensurePreAuthorizedCode(fixture(), 600)
    const r = redeemPreAuthorizedCode(a.exchange, 'not-the-code')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('invalid_grant')
  })

  test('returns invalid_grant on replay', () => {
    const a = ensurePreAuthorizedCode(fixture(), 600)
    const first = redeemPreAuthorizedCode(a.exchange, a.code)
    if (!first.ok) throw new Error('first redemption should succeed')
    const second = redeemPreAuthorizedCode(first.value.exchange, a.code)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error).toBe('invalid_grant')
  })

  test('returns invalid_grant when expired', () => {
    const a = ensurePreAuthorizedCode(fixture(), 600)
    const expired: App.ExchangeDetailClaim = {
      ...a.exchange,
      variables: {
        ...a.exchange.variables,
        oid4vci: {
          ...a.exchange.variables.oid4vci!,
          preAuthorizedCodeExpiresAt: '2000-01-01T00:00:00Z'
        }
      }
    }
    const r = redeemPreAuthorizedCode(expired, a.code)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('invalid_grant')
  })
})

describe('setAccessToken / validateAccessToken', () => {
  test('round-trips a freshly minted token', () => {
    const a = setAccessToken(fixture(), 600)
    const r = validateAccessToken(a.exchange, a.token)
    expect(r.ok).toBe(true)
    expect(a.expiresIn).toBe(600)
  })

  test('validateAccessToken returns invalid_token when none on file', () => {
    const r = validateAccessToken(fixture(), 'opaque')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('invalid_token')
  })

  test('validateAccessToken rejects a wrong token', () => {
    const a = setAccessToken(fixture(), 600)
    const r = validateAccessToken(a.exchange, 'wrong')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('invalid_token')
  })

  test('validateAccessToken rejects an expired token', () => {
    const a = setAccessToken(fixture(), 600)
    const expired: App.ExchangeDetailClaim = {
      ...a.exchange,
      variables: {
        ...a.exchange.variables,
        oid4vci: {
          ...a.exchange.variables.oid4vci!,
          accessTokenExpiresAt: '2000-01-01T00:00:00Z'
        }
      }
    }
    const r = validateAccessToken(expired, a.token)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('invalid_token')
  })
})

describe('mintNonce / validateAndConsumeNonce', () => {
  test('happy path consumes the nonce', () => {
    const a = mintNonce(fixture(), 300)
    const r = validateAndConsumeNonce(a.exchange, a.nonce)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.exchange.variables.oid4vci?.nonceUsed).toBe(true)
    }
  })

  test('mintNonce replaces a prior nonce', () => {
    const a = mintNonce(fixture(), 300)
    const b = mintNonce(a.exchange, 300)
    expect(b.nonce).not.toBe(a.nonce)
    expect(b.exchange.variables.oid4vci?.cNonce).toBe(b.nonce)
    // The old nonce is no longer the stored one.
    const stale = validateAndConsumeNonce(b.exchange, a.nonce)
    expect(stale.ok).toBe(false)
    if (!stale.ok) expect(stale.error).toBe('invalid_nonce')
  })

  test('rejects unknown / replayed / expired nonce as invalid_nonce', () => {
    expect(validateAndConsumeNonce(fixture(), 'x').ok).toBe(false)

    const a = mintNonce(fixture(), 300)
    const wrong = validateAndConsumeNonce(a.exchange, 'wrong')
    expect(wrong.ok).toBe(false)

    const first = validateAndConsumeNonce(a.exchange, a.nonce)
    if (!first.ok) throw new Error('first consume should succeed')
    const replay = validateAndConsumeNonce(first.value.exchange, a.nonce)
    expect(replay.ok).toBe(false)
    if (!replay.ok) expect(replay.error).toBe('invalid_nonce')

    const expired: App.ExchangeDetailClaim = {
      ...a.exchange,
      variables: {
        ...a.exchange.variables,
        oid4vci: {
          ...a.exchange.variables.oid4vci!,
          cNonceExpiresAt: '2000-01-01T00:00:00Z'
        }
      }
    }
    const ex = validateAndConsumeNonce(expired, a.nonce)
    expect(ex.ok).toBe(false)
    if (!ex.ok) expect(ex.error).toBe('invalid_nonce')
  })
})

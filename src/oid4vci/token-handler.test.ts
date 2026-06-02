import { describe, expect, test } from 'vitest'
import { ensurePreAuthorizedCode } from './state.js'
import { handleTokenRequest } from './token-handler.js'
import { PRE_AUTHORIZED_GRANT, tokenResponseSchema } from './schemas.js'

const fixture = (): App.ExchangeDetailClaim => ({
  tenantName: 'default',
  workflowId: 'claim',
  exchangeId: 'abc-123',
  expires: new Date(Date.now() + 60_000).toISOString(),
  state: 'pending',
  variables: {
    challenge: 'chal',
    exchangeHost: 'https://issuer.example',
    vc: '{"type":["VerifiableCredential","OpenBadgeCredential"]}'
  }
})

describe('handleTokenRequest', () => {
  test('happy path: redeems code, mints token, exchange has accessToken set', () => {
    const seeded = ensurePreAuthorizedCode(fixture(), 600)
    const result = handleTokenRequest(
      {
        grant_type: PRE_AUTHORIZED_GRANT,
        'pre-authorized_code': seeded.code
      },
      seeded.exchange
    )
    if (!result.ok) throw new Error('expected ok')
    const parsed = tokenResponseSchema.parse(result.response)
    expect(parsed.token_type).toBe('Bearer')
    expect(parsed.expires_in).toBeGreaterThan(0)
    expect(parsed.access_token.length).toBeGreaterThan(20)
    expect(result.exchange.variables.oid4vci?.accessToken).toBe(
      parsed.access_token
    )
    expect(result.exchange.variables.oid4vci?.codeUsed).toBe(true)
  })

  test('returns unsupported_grant_type for any non-pre-auth grant', () => {
    const seeded = ensurePreAuthorizedCode(fixture(), 600)
    const r = handleTokenRequest(
      {
        grant_type: 'authorization_code',
        'pre-authorized_code': seeded.code
      },
      seeded.exchange
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.body.error).toBe('unsupported_grant_type')
      expect(r.status).toBe(400)
    }
  })

  test('returns invalid_request when pre-authorized_code is missing', () => {
    const r = handleTokenRequest(
      { grant_type: PRE_AUTHORIZED_GRANT },
      fixture()
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.body.error).toBe('invalid_request')
  })

  test('returns invalid_request when grant_type is missing', () => {
    const r = handleTokenRequest({}, fixture())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.body.error).toBe('invalid_request')
  })

  test('returns invalid_request when no code has been issued', () => {
    const r = handleTokenRequest(
      {
        grant_type: PRE_AUTHORIZED_GRANT,
        'pre-authorized_code': 'whatever'
      },
      fixture()
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.body.error).toBe('invalid_request')
  })

  test('returns invalid_grant for a wrong code', () => {
    const seeded = ensurePreAuthorizedCode(fixture(), 600)
    const r = handleTokenRequest(
      {
        grant_type: PRE_AUTHORIZED_GRANT,
        'pre-authorized_code': 'not-the-code'
      },
      seeded.exchange
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.body.error).toBe('invalid_grant')
  })

  test('returns invalid_grant on replay', () => {
    const seeded = ensurePreAuthorizedCode(fixture(), 600)
    const first = handleTokenRequest(
      {
        grant_type: PRE_AUTHORIZED_GRANT,
        'pre-authorized_code': seeded.code
      },
      seeded.exchange
    )
    if (!first.ok) throw new Error('first should succeed')
    const second = handleTokenRequest(
      {
        grant_type: PRE_AUTHORIZED_GRANT,
        'pre-authorized_code': seeded.code
      },
      first.exchange
    )
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.body.error).toBe('invalid_grant')
  })

  test('returns invalid_grant for an expired code', () => {
    const seeded = ensurePreAuthorizedCode(fixture(), 600)
    const expired: App.ExchangeDetailClaim = {
      ...seeded.exchange,
      variables: {
        ...seeded.exchange.variables,
        oid4vci: {
          ...seeded.exchange.variables.oid4vci!,
          preAuthorizedCodeExpiresAt: '2000-01-01T00:00:00Z'
        }
      }
    }
    const r = handleTokenRequest(
      {
        grant_type: PRE_AUTHORIZED_GRANT,
        'pre-authorized_code': seeded.code
      },
      expired
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.body.error).toBe('invalid_grant')
  })
})

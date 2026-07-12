import { describe, expect, test } from 'vitest'
import { consumeOid4vpResponse, ensureOid4vpState } from './state.js'

const fixture = (
  overrides: Partial<App.ExchangeDetailVerify['variables']> = {}
): App.ExchangeDetailVerify => ({
  tenantName: 'default',
  workflowId: 'verify',
  exchangeId: 'exch-test',
  expires: new Date(Date.now() + 60_000).toISOString(),
  state: 'pending',
  variables: {
    challenge: 'chal-1',
    exchangeHost: 'https://verifier.example',
    vprContext: ['https://www.w3.org/2018/credentials/v1'],
    vprCredentialType: ['VerifiableCredential'],
    trustedIssuers: [],
    trustedRegistries: [],
    vprClaims: [],
    ...overrides
  }
})

describe('ensureOid4vpState', () => {
  test('mints a single-use state on first call', () => {
    const r = ensureOid4vpState(fixture())
    expect(r.isNew).toBe(true)
    expect(r.exchange.variables.oid4vp?.state).toBeTruthy()
    expect(r.exchange.variables.oid4vp?.responseReceived).toBe(false)
  })

  test('is idempotent once state exists', () => {
    const a = ensureOid4vpState(fixture())
    const b = ensureOid4vpState(a.exchange)
    expect(b.isNew).toBe(false)
    expect(b.exchange.variables.oid4vp?.state).toBe(
      a.exchange.variables.oid4vp?.state
    )
  })

  test('mints unpredictable, distinct state tokens across exchanges', () => {
    const a = ensureOid4vpState(fixture())
    const b = ensureOid4vpState(fixture())
    expect(a.exchange.variables.oid4vp?.state).not.toBe(
      b.exchange.variables.oid4vp?.state
    )
  })
})

describe('consumeOid4vpResponse', () => {
  test('accepts the matching state and marks the response received', () => {
    const { exchange } = ensureOid4vpState(fixture())
    const issued = exchange.variables.oid4vp!.state!
    const r = consumeOid4vpResponse(exchange, issued)
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('expected ok')
    expect(r.value.exchange.variables.oid4vp?.responseReceived).toBe(true)
  })

  test('rejects when no request was ever issued', () => {
    const r = consumeOid4vpResponse(fixture(), 'anything')
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('expected error')
    expect(r.error).toBe('invalid_request')
  })

  test('rejects a mismatched state', () => {
    const { exchange } = ensureOid4vpState(fixture())
    const r = consumeOid4vpResponse(exchange, 'wrong-state')
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('expected error')
    expect(r.error).toBe('invalid_request')
  })

  test('rejects a missing state', () => {
    const { exchange } = ensureOid4vpState(fixture())
    const r = consumeOid4vpResponse(exchange, undefined)
    expect(r.ok).toBe(false)
  })

  test('rejects a replayed response (single-use)', () => {
    const { exchange } = ensureOid4vpState(fixture())
    const issued = exchange.variables.oid4vp!.state!
    const first = consumeOid4vpResponse(exchange, issued)
    if (!first.ok) throw new Error('expected ok')
    const replay = consumeOid4vpResponse(first.value.exchange, issued)
    expect(replay.ok).toBe(false)
    if (replay.ok) throw new Error('expected error')
    expect(replay.reason).toMatch(/already been accepted/)
  })
})

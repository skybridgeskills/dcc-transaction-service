import { describe, expect, test } from 'vitest'
import {
  decideExchangeState,
  presentationVerified,
  recomputeVerified
} from './verify-outcome.js'
import { createMockExchange } from '../test-fixtures/testData.js'

const pass = (id: string, fatal = true): App.CheckResult => ({
  id,
  suite: id.split('.')[1] ?? 'test',
  outcome: { status: 'success', message: 'ok' },
  fatal
})

const fail = (id: string, fatal = true): App.CheckResult => ({
  id,
  suite: id.split('.')[1] ?? 'test',
  outcome: {
    status: 'failure',
    problems: [{ type: 'urn:test', title: 't', detail: 'd' }]
  },
  fatal
})

const credential = (
  verified: boolean,
  results: App.CheckResult[] = []
): App.CredentialVerificationResult => ({
  verified,
  verifiableCredential: {} as never,
  results,
  summary: []
})

const resultOf = (
  presentationResults: App.CheckResult[],
  credentialResults: App.CredentialVerificationResult[],
  verified = true
): App.VerificationResult => ({
  verified,
  presentationResults,
  credentialResults,
  matchedCredentials: [],
  summary: []
})

const exchange = (
  trustedIssuers: string[] = []
): App.ExchangeDetailVerify => {
  const e = createMockExchange()
  return { ...e, variables: { ...e.variables, trustedIssuers } }
}

describe('presentationVerified', () => {
  test('true with no failures', () => {
    expect(presentationVerified([pass('cryptographic.proof.signature')])).toBe(
      true
    )
  })

  test('a non-fatal failure is a warning, not a failure', () => {
    expect(
      presentationVerified([fail('trust.registry.issuer', false)])
    ).toBe(true)
  })

  test('a fatal failure makes it false', () => {
    expect(presentationVerified([fail('cryptographic.proof.signature')])).toBe(
      false
    )
  })
})

describe('recomputeVerified', () => {
  test('true when the presentation passed and every credential verified', () => {
    expect(
      recomputeVerified(resultOf([], [credential(true), credential(true)], false))
    ).toBe(true)
  })

  test('false when any credential is unverified', () => {
    expect(
      recomputeVerified(resultOf([], [credential(true), credential(false)]))
    ).toBe(false)
  })

  test("false when the presentation's own fatal check failed", () => {
    expect(
      recomputeVerified(
        resultOf([fail('cryptographic.proof.signature')], [credential(true)])
      )
    ).toBe(false)
  })
})

describe('decideExchangeState', () => {
  test('complete when everything verified', () => {
    expect(
      decideExchangeState(resultOf([], [credential(true)]), exchange())
    ).toBe('complete')
  })

  test('invalid when top-level verified is false', () => {
    expect(
      decideExchangeState(resultOf([], [credential(true)], false), exchange())
    ).toBe('invalid')
  })

  test('invalid when a credential is unverified', () => {
    expect(
      decideExchangeState(resultOf([], [credential(false)]), exchange())
    ).toBe('invalid')
  })

  test('with trusted issuers, a fatal registry failure is invalid', () => {
    const cr = credential(true, [fail('trust.registry.issuer')])
    expect(
      decideExchangeState(resultOf([], [cr]), exchange(['did:example:a']))
    ).toBe('invalid')
  })

  test('a non-fatal registry failure does not change state', () => {
    const cr = credential(true, [fail('trust.registry.issuer', false)])
    expect(
      decideExchangeState(resultOf([], [cr]), exchange(['did:example:a']))
    ).toBe('complete')
  })
})

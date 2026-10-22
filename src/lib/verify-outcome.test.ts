import { describe, expect, test } from 'vitest'
import type {
  EntityIdentityRegistry,
  RegistryCheckPayload
} from '@digitalcredentials/verifier-core'
import {
  decideExchangeState,
  deriveIssuerValidation,
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
  trustedIssuers: string[] = [],
  requireTrustedIssuer?: boolean
): App.ExchangeDetailVerify => {
  const e = createMockExchange()
  return {
    ...e,
    variables: {
      ...e.variables,
      trustedIssuers,
      ...(requireTrustedIssuer !== undefined && { requireTrustedIssuer })
    }
  }
}

const ISSUER = 'did:example:issuer'
const REGISTRIES: EntityIdentityRegistry[] = [
  { name: 'Reg A', type: 'dcc-legacy', url: 'https://a.example' },
  { name: 'Reg B', type: 'dcc-legacy', url: 'https://b.example' }
]

const registryRow = (
  outcome: App.CheckResult['outcome']
): App.CheckResult => ({
  id: 'trust.registry.issuer',
  suite: 'registry',
  outcome,
  fatal: false
})

const payload = (
  matched: string[],
  unchecked: string[] = []
): RegistryCheckPayload => ({
  matches: matched.map((name) => ({
    registry: { name, type: 'dcc-legacy' },
    entity: { name: `${name}'s name for the issuer`, url: 'https://issuer.example' }
  })),
  uncheckedRegistries: unchecked.map((name) => ({ name, type: 'dcc-legacy' }))
})

const notRegistered = (unchecked: string[] = []): App.CheckResult =>
  registryRow({
    status: 'failure',
    problems: [
      { type: 'urn:test#ISSUER_NOT_REGISTERED', title: 'Issuer Not Registered', detail: 'd' }
    ],
    payload: payload([], unchecked)
  })

const issuedBy = (
  results: App.CheckResult[],
  issuer: unknown = { id: ISSUER }
): App.CredentialVerificationResult => ({
  verified: true,
  verifiableCredential: { issuer } as never,
  results,
  summary: []
})

/** The record a result would carry after the sync pass or the worker. */
const withTrust = (
  credentialResults: App.CredentialVerificationResult[],
  e: App.ExchangeDetailVerify,
  registries: EntityIdentityRegistry[] | undefined = REGISTRIES
): App.VerificationResult => {
  const r = resultOf([], credentialResults)
  const issuerValidation = deriveIssuerValidation(r, e, registries)
  return { ...r, ...(issuerValidation && { issuerValidation }) }
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

  test('an untrusted issuer without requireTrustedIssuer is only a warning', () => {
    const e = exchange(['did:example:someone-else'])
    const r = withTrust([issuedBy([notRegistered()])], e)
    expect(r.issuerValidation!.credentials[0].trusted).toBe(false)
    expect(decideExchangeState(r, e)).toBe('complete')
  })

  test('an untrusted issuer with requireTrustedIssuer is invalid', () => {
    const e = exchange([], true)
    expect(decideExchangeState(withTrust([issuedBy([notRegistered()])], e), e)).toBe(
      'invalid'
    )
  })

  test('with requireTrustedIssuer, unchecked registries are not trust (Q14)', () => {
    const e = exchange([], true)
    const r = withTrust([issuedBy([notRegistered(['Reg B'])])], e)
    expect(r.issuerValidation!.credentials[0].uncheckedRegistries).toEqual(['Reg B'])
    expect(decideExchangeState(r, e)).toBe('invalid')
  })

  test('with requireTrustedIssuer, an allowlisted issuer is complete', () => {
    const e = exchange([ISSUER], true)
    expect(decideExchangeState(withTrust([issuedBy([notRegistered()])], e), e)).toBe(
      'complete'
    )
  })

  test('with requireTrustedIssuer, a registry match is complete', () => {
    const e = exchange([], true)
    const cr = issuedBy([
      registryRow({ status: 'success', message: 'found', payload: payload(['Reg A']) })
    ])
    expect(decideExchangeState(withTrust([cr], e), e)).toBe('complete')
  })

  test('with requireTrustedIssuer, a missing record is not trust', () => {
    const e = exchange([], true)
    expect(decideExchangeState(resultOf([], [issuedBy([])]), e)).toBe('invalid')
  })
})

describe('deriveIssuerValidation', () => {
  test('an issuer on the allowlist is trusted', () => {
    const iv = deriveIssuerValidation(
      resultOf([], [issuedBy([notRegistered()])]),
      exchange([ISSUER]),
      REGISTRIES
    )!
    expect(iv).toEqual({
      requireTrustedIssuer: false,
      trustedIssuers: [ISSUER],
      consultedRegistries: ['Reg A', 'Reg B'],
      credentials: [
        {
          index: 0,
          issuer: ISSUER,
          onAllowlist: true,
          registryMatches: [],
          uncheckedRegistries: [],
          trusted: true
        }
      ]
    })
  })

  test("a registry match records the registry and its name for the issuer", () => {
    const cr = issuedBy([
      registryRow({ status: 'success', message: 'found', payload: payload(['Reg A']) })
    ])
    const iv = deriveIssuerValidation(resultOf([], [cr]), exchange(), REGISTRIES)!
    expect(iv.credentials[0]).toMatchObject({
      onAllowlist: false,
      registryMatches: [
        {
          registry: 'Reg A',
          entityName: "Reg A's name for the issuer",
          entityUrl: 'https://issuer.example'
        }
      ],
      trusted: true
    })
  })

  test('no match (ISSUER_NOT_REGISTERED) is untrusted', () => {
    const iv = deriveIssuerValidation(
      resultOf([], [issuedBy([notRegistered()])]),
      exchange(),
      REGISTRIES
    )!
    expect(iv.credentials[0]).toMatchObject({
      registryMatches: [],
      uncheckedRegistries: [],
      trusted: false
    })
  })

  test('some registries unchecked and no match: untrusted, unchecked named', () => {
    const iv = deriveIssuerValidation(
      resultOf([], [issuedBy([notRegistered(['Reg B'])])]),
      exchange(),
      REGISTRIES
    )!
    expect(iv.credentials[0]).toMatchObject({
      uncheckedRegistries: ['Reg B'],
      trusted: false
    })
  })

  test('a lookup that failed with no payload checked none of the registries', () => {
    const cr = issuedBy([
      registryRow({
        status: 'failure',
        problems: [{ type: 'urn:test#REGISTRY_ERROR', title: 'Registry Lookup Error', detail: 'd' }]
      })
    ])
    const iv = deriveIssuerValidation(resultOf([], [cr]), exchange(), REGISTRIES)!
    expect(iv.credentials[0].uncheckedRegistries).toEqual(['Reg A', 'Reg B'])
  })

  test('a credential with no issuer has no issuer and is untrusted', () => {
    const cr = issuedBy(
      [
        registryRow({
          status: 'failure',
          problems: [{ type: 'urn:test#ISSUER_NOT_FOUND', title: 'Issuer Not Found', detail: 'd' }]
        })
      ],
      null
    )
    const iv = deriveIssuerValidation(resultOf([], [cr]), exchange([ISSUER]), REGISTRIES)!
    expect('issuer' in iv.credentials[0]).toBe(false)
    expect(iv.credentials[0].trusted).toBe(false)
  })

  test('nothing to report when nothing was asked and no lookup ran', () => {
    const cr = issuedBy([
      registryRow({ status: 'skipped', reason: 'No registries configured' })
    ])
    expect(deriveIssuerValidation(resultOf([], [cr]), exchange(), undefined)).toBeUndefined()
  })

  test('a skipped lookup still reports when the exchange asked about trust', () => {
    const cr = issuedBy([
      registryRow({ status: 'skipped', reason: 'No registries configured' })
    ])
    const iv = deriveIssuerValidation(resultOf([], [cr]), exchange([], true), undefined)!
    expect(iv.consultedRegistries).toEqual([])
    expect(iv.credentials[0]).toMatchObject({ uncheckedRegistries: [], trusted: false })
  })

  test('a deployment-default lookup reaches callers even when the exchange asked nothing', () => {
    const iv = deriveIssuerValidation(
      resultOf([], [issuedBy([notRegistered()])]),
      exchange(),
      REGISTRIES
    )
    expect(iv?.credentials[0].trusted).toBe(false)
  })
})

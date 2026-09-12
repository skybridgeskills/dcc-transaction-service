import { afterEach, describe, expect, test } from 'vitest'
import { SPOOF_ISSUER, TEST_ISSUER, testIssuerIdentity } from './test-issuer.js'

const ORIGINAL = process.env.CLI_EXCHANGE_HOST

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CLI_EXCHANGE_HOST
  else process.env.CLI_EXCHANGE_HOST = ORIGINAL
})

describe('testIssuerIdentity', () => {
  test('derives the DID from CLI_EXCHANGE_HOST, not from a written-down host', () => {
    process.env.CLI_EXCHANGE_HOST = 'https://exchanges.example'
    expect(testIssuerIdentity('test-issuer')).toEqual({
      did: 'did:web:exchanges.example:ui:test-issuer',
      url: 'https://exchanges.example/ui/test-issuer/'
    })
  })

  /** did:web percent-encodes a port inside the authority component. */
  test('percent-encodes a port', () => {
    process.env.CLI_EXCHANGE_HOST = 'http://localhost:4004'
    expect(testIssuerIdentity('spoof-issuer').did).toBe(
      'did:web:localhost%3A4004:ui:spoof-issuer'
    )
  })

  test('falls back to the CLI default host when unset', () => {
    delete process.env.CLI_EXCHANGE_HOST
    expect(testIssuerIdentity('test-issuer').did).toBe(
      'did:web:localhost%3A4004:ui:test-issuer'
    )
  })

  test('falls back rather than throwing on an unparseable host', () => {
    process.env.CLI_EXCHANGE_HOST = 'not a url'
    expect(testIssuerIdentity('test-issuer').did).toBe(
      'did:web:localhost%3A4004:ui:test-issuer'
    )
  })
})

describe('the two exported identities', () => {
  /**
   * ⚠️ `tamper: 'issuer'` refuses to build a fixture whose declared issuer is
   * the signer, and the spoof fixture is worthless if the two ever converge.
   */
  test('are distinct', () => {
    expect(SPOOF_ISSUER.did).not.toBe(TEST_ISSUER.did)
  })

  test('carry no deployment-specific hostname of their own', () => {
    for (const identity of [TEST_ISSUER, SPOOF_ISSUER]) {
      expect(identity.did).toMatch(/^did:web:/)
      expect(identity.url).toContain('/ui/')
    }
  })
})

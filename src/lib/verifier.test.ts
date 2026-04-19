import { afterEach, describe, expect, test } from 'vitest'
import { getVerifier, resetVerifierForTests } from './verifier.js'
import { resetVerifierKeyvForTests } from './verifier-keyv-store.js'

describe('getVerifier', () => {
  afterEach(() => {
    resetVerifierForTests()
    resetVerifierKeyvForTests()
  })

  test('returns the same Verifier instance on repeated calls', () => {
    const a = getVerifier()
    const b = getVerifier()
    expect(a).toBe(b)
  })

  test('exposes verifyCredential and verifyPresentation methods', () => {
    const v = getVerifier()
    expect(typeof v.verifyCredential).toBe('function')
    expect(typeof v.verifyPresentation).toBe('function')
  })

  test('resetVerifierForTests yields a fresh instance', () => {
    const a = getVerifier()
    resetVerifierForTests()
    const b = getVerifier()
    expect(a).not.toBe(b)
  })
})

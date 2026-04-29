import { describe, expect, test } from 'vitest'
import { ed25519Signature2020Context } from './ed25519-signature-2020-context.js'

const SUITE_URL = 'https://w3id.org/security/suites/ed25519-2020/v1'

const entity = (overrides: Record<string, unknown> = {}) => ({
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  type: 'VerifiablePresentation',
  proof: {
    type: 'Ed25519Signature2020',
    '@context': SUITE_URL
  },
  ...overrides
})

describe('ed25519Signature2020Context', () => {
  test('disabled → returns input unchanged with empty log', () => {
    const input = entity()
    const out = ed25519Signature2020Context(input, { enabled: false })
    expect(out.result).toBe(input)
    expect(out.log).toEqual([])
  })

  test('enabled + applicable → adds suite URL to top-level @context', () => {
    const input = entity()
    const out = ed25519Signature2020Context(input, { enabled: true })
    expect((out.result as { '@context': unknown[] })['@context']).toEqual([
      'https://www.w3.org/2018/credentials/v1',
      SUITE_URL
    ])
    expect(out.log).toHaveLength(1)
    expect(out.log[0].id).toBe(
      'compat.verifiable-entity.ed25519-signature-2020-context'
    )
    expect(out.log[0].id).toMatch(/^compat\.[a-z][a-z0-9.-]*$/)
    expect(out.log[0].outcome.status).toBe('success')
  })

  test('enabled + no proof → no-op', () => {
    const input = { '@context': ['x'] }
    const out = ed25519Signature2020Context(input, { enabled: true })
    expect(out.result).toBe(input)
    expect(out.log).toEqual([])
  })

  test('enabled + non-Ed25519Signature2020 proof type → no-op', () => {
    const input = entity({
      proof: { type: 'OtherSignature', '@context': SUITE_URL }
    })
    const out = ed25519Signature2020Context(input, { enabled: true })
    expect(out.result).toBe(input)
    expect(out.log).toEqual([])
  })

  test('enabled + proof @context does not declare suite URL → no-op', () => {
    const input = entity({
      proof: { type: 'Ed25519Signature2020', '@context': 'https://other' }
    })
    const out = ed25519Signature2020Context(input, { enabled: true })
    expect(out.result).toBe(input)
    expect(out.log).toEqual([])
  })

  test('enabled + entity @context already declares suite URL → no-op', () => {
    const input = entity({
      '@context': ['https://www.w3.org/2018/credentials/v1', SUITE_URL]
    })
    const out = ed25519Signature2020Context(input, { enabled: true })
    expect(out.result).toBe(input)
    expect(out.log).toEqual([])
  })

  test('enabled + proof type as array including Ed25519Signature2020 → applies', () => {
    const input = entity({
      proof: {
        type: ['SomeOther', 'Ed25519Signature2020'],
        '@context': SUITE_URL
      }
    })
    const out = ed25519Signature2020Context(input, { enabled: true })
    expect(
      (out.result as { '@context': unknown[] })['@context']
    ).toContain(SUITE_URL)
  })

  test('enabled + proof @context as array → checks correctly', () => {
    const input = entity({
      proof: {
        type: 'Ed25519Signature2020',
        '@context': ['other', SUITE_URL]
      }
    })
    const out = ed25519Signature2020Context(input, { enabled: true })
    expect(
      (out.result as { '@context': unknown[] })['@context']
    ).toContain(SUITE_URL)
  })

  test('enabled + missing entity @context → adds suite URL alone', () => {
    const input = {
      proof: {
        type: 'Ed25519Signature2020',
        '@context': SUITE_URL
      }
    }
    const out = ed25519Signature2020Context(input, { enabled: true })
    expect((out.result as { '@context': unknown[] })['@context']).toEqual([
      SUITE_URL
    ])
    expect(out.log).toHaveLength(1)
  })

  test('does not mutate input', () => {
    const input = entity()
    const before = JSON.parse(JSON.stringify(input))
    ed25519Signature2020Context(input, { enabled: true })
    expect(input).toEqual(before)
  })
})

import { describe, expect, test } from 'vitest'
import { wrapBarePresentation } from './wrap-bare-presentation.js'

describe('wrapBarePresentation', () => {
  test('disabled → returns input unchanged with empty log', () => {
    const input = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: 'VerifiablePresentation'
    }
    const out = wrapBarePresentation(input, { enabled: false })
    expect(out.result).toBe(input)
    expect(out.log).toEqual([])
  })

  test('enabled + already wrapped → no-op', () => {
    const input = {
      verifiablePresentation: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: 'VerifiablePresentation'
      }
    }
    const out = wrapBarePresentation(input, { enabled: true })
    expect(out.result).toBe(input)
    expect(out.log).toEqual([])
  })

  test('enabled + bare VP (has @context, no verifiablePresentation) → wraps', () => {
    const inputVp = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: 'VerifiablePresentation',
      holder: 'did:example:abc',
      proof: { type: 'Ed25519Signature2020' }
    }
    const out = wrapBarePresentation(inputVp, { enabled: true })
    expect(out.result).toEqual({ verifiablePresentation: inputVp })
    expect(out.log).toHaveLength(1)
    expect(out.log[0].id).toBe(
      'compat.vcalm-participation-message.wrap-bare-presentation'
    )
    expect(out.log[0].id).toMatch(/^compat\.[a-z][a-z0-9.-]*$/)
    expect(out.log[0].outcome.status).toBe('success')
  })

  test('enabled + non-VP body (no @context, no verifiablePresentation) → no-op', () => {
    const input = { foo: 'bar' }
    const out = wrapBarePresentation(input, { enabled: true })
    expect(out.result).toBe(input)
    expect(out.log).toEqual([])
  })

  test('inner VP reference is preserved (not deep-cloned)', () => {
    const inputVp = {
      '@context': ['https://www.w3.org/2018/credentials/v1']
    }
    const out = wrapBarePresentation(inputVp, { enabled: true })
    expect((out.result as { verifiablePresentation: unknown }).verifiablePresentation).toBe(inputVp)
  })
})

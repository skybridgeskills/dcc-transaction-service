import { describe, test, expect } from 'vitest'
import { verifiablePresentationSchema } from './schema.js'

const validProof = {
  type: 'Ed25519Signature2020',
  created: '2026-03-16T01:10:43Z',
  verificationMethod:
    'did:key:z6MkpYDh7CZW4rtwGUzazdqJaffTnGZV3K7M77qTCc4G7PQS#z6MkpYDh7CZW4rtwGUzazdqJaffTnGZV3K7M77qTCc4G7PQS',
  proofPurpose: 'authentication',
  proofValue:
    'z3iXsvAxmKhYjz4VL84Eu38AkcSNJSK73iJTf83KpqRjLUAWajBW4nitbv8rxT7ZX2ASDezPkCywWDGNL5TmRKVyQ'
}

const validVC = {
  '@context': ['https://www.w3.org/ns/credentials/v2'],
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  issuer: 'did:key:z6MkissuerExample',
  validFrom: '2026-01-01T00:00:00Z',
  credentialSubject: { id: 'did:key:z6MkholderExample' }
}

const baseVP = {
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    'https://w3id.org/security/suites/ed25519-2020/v1'
  ],
  type: 'VerifiablePresentation',
  holder: 'did:key:z6MkpYDh7CZW4rtwGUzazdqJaffTnGZV3K7M77qTCc4G7PQS',
  verifiableCredential: validVC,
  proof: validProof
}

describe('verifiablePresentationSchema', () => {
  test('VP with type as string normalizes to array', () => {
    const result = verifiablePresentationSchema.parse(baseVP)
    expect(result.type).toEqual(['VerifiablePresentation'])
  })

  test('VP with type as array passes through', () => {
    const vp = { ...baseVP, type: ['VerifiablePresentation'] }
    const result = verifiablePresentationSchema.parse(vp)
    expect(result.type).toEqual(['VerifiablePresentation'])
  })

  test('rejects type: "Banana"', () => {
    const vp = { ...baseVP, type: 'Banana' }
    const result = verifiablePresentationSchema.safeParse(vp)
    expect(result.success).toBe(false)
  })

  test('rejects type array missing VerifiablePresentation', () => {
    const vp = { ...baseVP, type: ['Something'] }
    const result = verifiablePresentationSchema.safeParse(vp)
    expect(result.success).toBe(false)
  })

  test('singular verifiableCredential normalizes to array of 1', () => {
    const result = verifiablePresentationSchema.parse(baseVP)
    expect(result.verifiableCredential).toEqual([validVC])
  })

  test('array verifiableCredential passes through as array', () => {
    const vp = { ...baseVP, verifiableCredential: [validVC, validVC] }
    const result = verifiablePresentationSchema.parse(vp)
    expect(result.verifiableCredential).toHaveLength(2)
  })

  test('holder as string DID parses', () => {
    const result = verifiablePresentationSchema.parse(baseVP)
    expect(result.holder).toBe(
      'did:key:z6MkpYDh7CZW4rtwGUzazdqJaffTnGZV3K7M77qTCc4G7PQS'
    )
  })

  test('holder as object with id parses', () => {
    const vp = {
      ...baseVP,
      holder: {
        id: 'did:key:z6MkpYDh7CZW4rtwGUzazdqJaffTnGZV3K7M77qTCc4G7PQS',
        name: 'Test Holder'
      }
    }
    const result = verifiablePresentationSchema.parse(vp)
    expect(result.holder).toEqual({
      id: 'did:key:z6MkpYDh7CZW4rtwGUzazdqJaffTnGZV3K7M77qTCc4G7PQS',
      name: 'Test Holder'
    })
  })

  test('VP without holder parses (optional per spec)', () => {
    const { holder: _, ...vpWithout } = baseVP
    const result = verifiablePresentationSchema.parse(vpWithout)
    expect(result.holder).toBeUndefined()
  })

  test('rejects holder as array', () => {
    const vp = { ...baseVP, holder: ['did:key:z6MkExample'] }
    const result = verifiablePresentationSchema.safeParse(vp)
    expect(result.success).toBe(false)
  })

  test('VP without verifiableCredential parses (optional per W3C VCDM)', () => {
    const { verifiableCredential: _, ...vpWithout } = baseVP
    const result = verifiablePresentationSchema.parse(vpWithout)
    expect(result.verifiableCredential).toBeUndefined()
  })

  test('preserves extra properties via passthrough', () => {
    const vp = { ...baseVP, customField: 'custom-value' }
    const result = verifiablePresentationSchema.parse(vp)
    expect((result as Record<string, unknown>).customField).toBe('custom-value')
  })

  test('parses real-world VP example', () => {
    const realWorldVP = {
      '@context': [
        'https://www.w3.org/ns/credentials/v2',
        'https://w3id.org/security/suites/ed25519-2020/v1'
      ],
      type: 'VerifiablePresentation',
      holder: 'did:key:z6MkpYDh7CZW4rtwGUzazdqJaffTnGZV3K7M77qTCc4G7PQS',
      verifiableCredential: {
        '@context': [
          'https://www.w3.org/ns/credentials/v2',
          'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
          'https://w3id.org/security/suites/ed25519-2020/v1'
        ],
        id: 'urn:uuid:951b475e-b795-43bc-ba8f-a2d01571c164',
        type: ['VerifiableCredential', 'OpenBadgeCredential'],
        name: 'Introduction to Computer Science',
        issuer: {
          id: 'did:key:z6Mko3vgms1K7mccKpUEKQivWdM5BefHfSJEF4XAXofXaGJC',
          type: 'Profile',
          name: 'Jobs for the Future (JFF)',
          url: 'https://www.jff.org/'
        },
        validFrom: '2025-08-19T19:55:08.151Z',
        credentialSubject: {
          type: 'AchievementSubject',
          achievement: {
            id: 'urn:uuid:213e594f-a9f6-4171-b8e6-027b66624fc7',
            type: ['Achievement'],
            name: 'Introduction to Computer Science',
            criteria: { type: 'Criteria', narrative: 'Completed course' }
          }
        },
        proof: validProof
      },
      proof: {
        type: 'DataIntegrityProof',
        created: '2026-03-16T01:10:43Z',
        verificationMethod:
          'did:key:z6MkpYDh7CZW4rtwGUzazdqJaffTnGZV3K7M77qTCc4G7PQS#z6MkpYDh7CZW4rtwGUzazdqJaffTnGZV3K7M77qTCc4G7PQS',
        proofPurpose: 'authentication',
        proofValue: 'zSomeProofValue',
        cryptosuite: 'eddsa-rdfc-2022',
        challenge: 'abc123'
      }
    }
    const result = verifiablePresentationSchema.parse(realWorldVP)
    expect(result.type).toEqual(['VerifiablePresentation'])
    expect(result.verifiableCredential).toHaveLength(1)
    expect(result.holder).toBe(
      'did:key:z6MkpYDh7CZW4rtwGUzazdqJaffTnGZV3K7M77qTCc4G7PQS'
    )
  })
})

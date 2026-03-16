import { describe, test, expect } from 'vitest'
import { verifiablePresentationSchema } from './verifiableCredentialSchema.js'

const validProof = {
  type: 'Ed25519Signature2020',
  created: '2026-03-16T01:10:43Z',
  verificationMethod:
    'did:key:z6MkpYDh7CZW4rtwGUzazdqJaffTnGZV3K7M77qTCc4G7PQS#z6MkpYDh7CZW4rtwGUzazdqJaffTnGZV3K7M77qTCc4G7PQS',
  proofPurpose: 'authentication',
  proofValue: 'z3iXsvAxmKhYjz4VL84Eu38AkcSNJSK73iJTf83KpqRjLUAWajBW4nitbv8rxT7ZX2ASDezPkCywWDGNL5TmRKVyQ'
}

const validCredentialV2 = {
  '@context': ['https://www.w3.org/ns/credentials/v2'],
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  issuer: 'did:key:z6MkissuerExample',
  validFrom: '2026-01-01T00:00:00Z',
  credentialSubject: { id: 'did:key:z6MkholderExample' },
  proof: validProof
}

const baseVP = {
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    'https://w3id.org/security/suites/ed25519-2020/v1'
  ],
  holder: 'did:key:z6MkpYDh7CZW4rtwGUzazdqJaffTnGZV3K7M77qTCc4G7PQS',
  verifiableCredential: validCredentialV2,
  proof: validProof
}

describe('verifiablePresentationSchema', () => {
  test('parses VP with type as string', () => {
    const vp = { ...baseVP, type: 'VerifiablePresentation' }
    expect(() => verifiablePresentationSchema.parse(vp)).not.toThrow()
  })

  test('parses VP with type as array', () => {
    const vp = { ...baseVP, type: ['VerifiablePresentation'] }
    expect(() => verifiablePresentationSchema.parse(vp)).not.toThrow()
  })

  test('parses VP with holder as string (DID)', () => {
    const vp = { ...baseVP, type: 'VerifiablePresentation' }
    const result = verifiablePresentationSchema.parse(vp)
    expect(result.holder).toBe('did:key:z6MkpYDh7CZW4rtwGUzazdqJaffTnGZV3K7M77qTCc4G7PQS')
  })

  test('parses VP with holder as IssuerObject', () => {
    const vp = {
      ...baseVP,
      type: 'VerifiablePresentation',
      holder: {
        id: 'did:key:z6MkpYDh7CZW4rtwGUzazdqJaffTnGZV3K7M77qTCc4G7PQS',
        name: 'Test Holder'
      }
    }
    expect(() => verifiablePresentationSchema.parse(vp)).not.toThrow()
  })

  test('rejects VP missing verifiableCredential', () => {
    const { verifiableCredential: _, ...vpWithout } = baseVP
    const vp = { ...vpWithout, type: 'VerifiablePresentation' }
    expect(() => verifiablePresentationSchema.parse(vp)).toThrow()
  })

  test('rejects VP missing holder', () => {
    const { holder: _, ...vpWithout } = baseVP
    const vp = { ...vpWithout, type: 'VerifiablePresentation' }
    expect(() => verifiablePresentationSchema.parse(vp)).toThrow()
  })

  test('preserves extra properties via passthrough', () => {
    const vp = {
      ...baseVP,
      type: 'VerifiablePresentation',
      customField: 'custom-value'
    }
    const result = verifiablePresentationSchema.parse(vp)
    expect((result as any).customField).toBe('custom-value')
  })

  test('parses VP with array of credentials', () => {
    const vp = {
      ...baseVP,
      type: 'VerifiablePresentation',
      verifiableCredential: [validCredentialV2, validCredentialV2]
    }
    expect(() => verifiablePresentationSchema.parse(vp)).not.toThrow()
  })
})

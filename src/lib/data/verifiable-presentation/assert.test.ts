import { describe, expect, test } from 'vitest'
import { HTTPException } from 'hono/http-exception'
import type { ProblemDetailResponse } from '../../errors/problem-details.js'
import { assertValidVerifiablePresentationStructure } from './assert.js'

const validProof = {
  type: 'Ed25519Signature2020',
  created: '2024-01-01T00:00:00Z',
  verificationMethod: 'did:key:z6Mk#z6Mk',
  proofPurpose: 'authentication',
  proofValue: 'zTest',
  challenge: 'test-challenge'
}

const validVc = {
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  type: ['VerifiableCredential'],
  issuer: 'did:key:zIssuer',
  issuanceDate: '2024-01-01T00:00:00Z',
  credentialSubject: { id: 'did:key:zSubject' }
}

describe('assertValidVerifiablePresentationStructure', () => {
  test('returns void for a structurally valid VP (single-string type, single VC)', () => {
    const presentation = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: 'VerifiablePresentation',
      holder: 'did:key:zHolder',
      verifiableCredential: validVc,
      proof: validProof
    }
    expect(
      assertValidVerifiablePresentationStructure(presentation)
    ).toBeUndefined()
  })

  test('returns void for a structurally valid VP (array type, array VC)', () => {
    const presentation = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiablePresentation'],
      holder: 'did:key:zHolder',
      verifiableCredential: [validVc],
      proof: validProof
    }
    expect(
      assertValidVerifiablePresentationStructure(presentation)
    ).toBeUndefined()
  })

  test('throws HTTPException(400) with problem-details for missing fields', () => {
    expect(() =>
      assertValidVerifiablePresentationStructure({ invalid: 'not a VP' })
    ).toThrow(HTTPException)

    try {
      assertValidVerifiablePresentationStructure({ invalid: 'not a VP' })
      expect.unreachable()
    } catch (e) {
      const err = e as HTTPException
      expect(err.status).toBe(400)
      const cause = err.cause as ProblemDetailResponse
      expect(cause.message).toBe('Invalid Verifiable Presentation')
      expect(cause.problemDetails.length).toBeGreaterThan(0)
      expect(cause.problemDetails[0].detail).toContain('verifiablePresentation')
    }
  })

  test('does NOT mutate or coerce the input value', () => {
    const presentation = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: 'VerifiablePresentation',
      holder: 'did:key:zHolder',
      verifiableCredential: validVc,
      proof: validProof
    }
    const before = JSON.parse(JSON.stringify(presentation))
    assertValidVerifiablePresentationStructure(presentation)
    expect(presentation).toEqual(before)
    expect(presentation.type).toBe('VerifiablePresentation')
  })
})

import { describe, test, expect } from 'vitest'
import {
  credentialV1Schema,
  credentialV2Schema,
  credentialSchema
} from './schema.js'

const baseV2 = {
  '@context': ['https://www.w3.org/ns/credentials/v2'],
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  issuer: 'did:key:z6MkissuerExample',
  validFrom: '2026-01-01T00:00:00Z',
  credentialSubject: { id: 'did:key:z6MkholderExample' }
}

const baseV1 = {
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  issuer: 'did:key:z6MkissuerExample',
  issuanceDate: '2026-01-01T00:00:00Z',
  credentialSubject: { id: 'did:key:z6MkholderExample' }
}

const sampleStatus = {
  id: 'https://example.com/status/1#0',
  type: 'BitstringStatusListEntry',
  statusPurpose: 'revocation',
  statusListIndex: '0',
  statusListCredential: 'https://example.com/status/1'
}

describe('credentialV2Schema', () => {
  test('singular type string normalizes to array', () => {
    const vc = { ...baseV2, type: 'VerifiableCredential' }
    const result = credentialV2Schema.parse(vc)
    expect(result.type).toEqual(['VerifiableCredential'])
  })

  test('array type passes through', () => {
    const result = credentialV2Schema.parse(baseV2)
    expect(result.type).toEqual(['VerifiableCredential', 'OpenBadgeCredential'])
  })

  test('rejects type missing VerifiableCredential', () => {
    const vc = { ...baseV2, type: ['OpenBadgeCredential'] }
    const result = credentialV2Schema.safeParse(vc)
    expect(result.success).toBe(false)
  })

  test('singular credentialStatus normalizes to array', () => {
    const vc = { ...baseV2, credentialStatus: sampleStatus }
    const result = credentialV2Schema.parse(vc)
    expect(result.credentialStatus).toEqual([sampleStatus])
  })

  test('array credentialStatus passes through', () => {
    const vc = { ...baseV2, credentialStatus: [sampleStatus] }
    const result = credentialV2Schema.parse(vc)
    expect(result.credentialStatus).toEqual([sampleStatus])
  })

  test('no credentialStatus passes (optional)', () => {
    const result = credentialV2Schema.parse(baseV2)
    expect(result.credentialStatus).toBeUndefined()
  })

  test('preserves extra properties via passthrough', () => {
    const vc = { ...baseV2, customField: 'hello' }
    const result = credentialV2Schema.parse(vc)
    expect((result as Record<string, unknown>).customField).toBe('hello')
  })
})

describe('credentialV1Schema', () => {
  test('V1 credential with issuanceDate parses', () => {
    const result = credentialV1Schema.parse(baseV1)
    expect(result.issuanceDate).toBe('2026-01-01T00:00:00Z')
  })

  test('V1 with expirationDate parses', () => {
    const vc = { ...baseV1, expirationDate: '2027-01-01T00:00:00Z' }
    const result = credentialV1Schema.parse(vc)
    expect(result.expirationDate).toBe('2027-01-01T00:00:00Z')
  })

  test('V1 type normalizes singular string', () => {
    const vc = { ...baseV1, type: 'VerifiableCredential' }
    const result = credentialV1Schema.parse(vc)
    expect(result.type).toEqual(['VerifiableCredential'])
  })
})

describe('credentialSchema (V1/V2 union)', () => {
  test('parses V2 credential', () => {
    const result = credentialSchema.parse(baseV2)
    expect(result.type).toEqual(['VerifiableCredential', 'OpenBadgeCredential'])
  })

  test('parses V1 credential', () => {
    const result = credentialSchema.parse(baseV1)
    expect(result.type).toEqual(['VerifiableCredential', 'OpenBadgeCredential'])
  })
})

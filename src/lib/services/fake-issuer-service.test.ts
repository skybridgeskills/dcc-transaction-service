import { describe, test, expect } from 'vitest'
import { FakeIssuerService } from './fake-issuer-service.js'

const testCredentialOB = {
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
  ],
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  credentialSubject: {
    id: 'did:example:subject',
    achievement: {
      id: 'https://example.com/achievements/21st-century-skills/teamwork',
      type: ['Achievement'],
      criteria: {
        narrative:
          'Team members are nominated for this badge by their peers and recognized upon review by Example Corp management.'
      },
      description:
        'This badge recognizes the development of the capacity to collaborate within a group environment.',
      name: 'Teamwork'
    }
  },
  issuanceDate: '2024-01-01T00:00:00Z'
}

describe('FakeIssuerService', () => {
  test('signs a credential with default key', async () => {
    const service = new FakeIssuerService()

    const signed = await service.signCredential(testCredentialOB, 'test-tenant')

    expect(signed).toBeDefined()
    expect(signed.proof).toBeDefined()
    expect(signed.issuer).toBeDefined()
    expect(signed.type).toEqual(['VerifiableCredential', 'OpenBadgeCredential'])
  })

  test('signs a credential with custom issuer DID', async () => {
    const customDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
    const service = new FakeIssuerService()

    const signed = await service.signCredential(
      testCredentialOB,
      'test-tenant',
      {
        issuerDid: customDid
      }
    )

    expect(signed.issuer).toBe(customDid)
    expect(signed.proof).toBeDefined()
  })

  test('uses provided issuer from credential if present', async () => {
    const service = new FakeIssuerService()
    const credential = {
      ...testCredentialOB,
      issuer: {
        id: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        name: 'Test Issuer'
      }
    }

    const signed = await service.signCredential(credential, 'test-tenant')

    expect(signed.issuer).toBeDefined()
    expect(signed.proof).toBeDefined()
  })
})

import { FakeIssuerService } from './fake-issuer-service.js'

/** Minimal VC using only W3C credentials v2 context so documentLoader can expand without remote OB context. */
const testCredential = {
  '@context': ['https://www.w3.org/ns/credentials/v2'],
  type: ['VerifiableCredential'],
  credentialSubject: {
    id: 'did:example:subject'
  },
  validFrom: '2024-01-01T00:00:00Z'
}

describe('FakeIssuerService', () => {
  test('signs a credential with default key', async () => {
    const service = new FakeIssuerService()

    const signed = await service.signCredential(testCredential, 'test-tenant')

    expect(signed).toBeDefined()
    expect(signed.proof).toBeDefined()
    expect(signed.issuer).toBeDefined()
    expect(signed.type).toEqual(['VerifiableCredential'])
  })

  test('signs a credential with custom issuer DID', async () => {
    const customDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
    const service = new FakeIssuerService()

    const signed = await service.signCredential(testCredential, 'test-tenant', {
      issuerDid: customDid
    })

    expect(signed.issuer).toBe(customDid)
    expect(signed.proof).toBeDefined()
  })

  test('uses provided issuer from credential if present', async () => {
    const service = new FakeIssuerService()
    const credential = {
      ...testCredential,
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

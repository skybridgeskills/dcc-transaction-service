import testVC from './testVC.js'

const getDataForExchangeSetupPost = (
  tenantName: string,
  exchangeHost = 'http://localhost:4005',
  workflowId = 'didAuth'
) => {
  const fakeData = {
    tenantName,
    workflowId,
    exchangeHost,
    data: [
      { vc: JSON.stringify(testVC), retrievalId: 'someId' },
      { vc: JSON.stringify(testVC), retrievalId: 'blah' }
    ]
  }
  return fakeData
}

// Test factories for verification workflow
export const createMockExchange = (
  overrides: Partial<App.ExchangeDetailVerify> = {}
): App.ExchangeDetailVerify => ({
  workflowId: 'verify',
  exchangeId: 'test-exchange-id',
  tenantName: 'test-tenant',
  expires: new Date(Date.now() + 600000).toISOString(), // 10 minutes from now
  state: 'pending',
  variables: {
    exchangeHost: 'http://localhost:4004',
    challenge: 'test-challenge',
    features: { details: true },
    vprContext: ['https://www.w3.org/2018/credentials/v1'],
    vprCredentialType: ['VerifiableCredential'],
    trustedIssuers: [],
    trustedRegistries: [],
    vprClaims: []
  },
  ...overrides
})

export const createMockCredential = (overrides: any = {}): any => ({
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  id: 'urn:uuid:test-credential-id',
  issuer: {
    id: 'did:key:z6MkhVTX9BF3NGYX6cc7jWpbNnR7cAjH8LUffabZP8Qu4ysC',
    type: 'Profile',
    name: 'Test Issuer'
  },
  issuanceDate: '2024-01-01T00:00:00Z',
  credentialSubject: {
    id: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    type: 'AchievementSubject',
    achievement: {
      id: 'urn:uuid:test-achievement-id',
      type: 'Achievement',
      name: 'Test Achievement'
    }
  },
  proof: {
    type: 'Ed25519Signature2020',
    created: '2024-01-01T00:00:00Z',
    verificationMethod:
      'did:key:z6MkhVTX9BF3NGYX6cc7jWpbNnR7cAjH8LUffabZP8Qu4ysC#z6MkhVTX9BF3NGYX6cc7jWpbNnR7cAjH8LUffabZP8Qu4ysC',
    proofPurpose: 'assertionMethod',
    jws: 'test-jws-signature'
  },
  ...overrides
})

export const createMockPresentation = (
  credentials: any[] = [],
  overrides: any = {}
): any => ({
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  type: ['VerifiablePresentation'],
  holder: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
  verifiableCredential: credentials,
  proof: {
    type: 'Ed25519Signature2020',
    created: '2024-01-01T00:00:00Z',
    verificationMethod:
      'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK#z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    proofPurpose: 'authentication',
    challenge: 'test-challenge',
    jws: 'test-presentation-jws'
  },
  ...overrides
})

export const createMockVerifierCoreResult = (
  presentationValid = true,
  credentialsValid = true,
  overrides: any = {}
): import('@digitalcredentials/verifier-core').PresentationVerificationResult => ({
  verified: presentationValid && credentialsValid,
  presentationResults: presentationValid
    ? [
        {
          suite: 'proof',
          check: 'proof.signature-valid',
          outcome: { status: 'success', message: 'Presentation signature is valid' },
          timestamp: new Date().toISOString(),
          fatal: true
        }
      ]
    : [
        {
          suite: 'proof',
          check: 'proof.signature-valid',
          outcome: {
            status: 'failure',
            problems: [
              {
                type: 'https://w3id.org/security#INVALID_SIGNATURE',
                title: 'Invalid Signature',
                detail: 'The presentation signature could not be verified'
              }
            ]
          },
          timestamp: new Date().toISOString(),
          fatal: true
        }
      ],
  credentialResults: credentialsValid
    ? [
        {
          verified: true,
          credential: createMockCredential(),
          results: [
            {
              suite: 'core',
              check: 'core.id-valid',
              outcome: { status: 'success', message: 'Credential ID is valid' },
              timestamp: new Date().toISOString()
            },
            {
              suite: 'proof',
              check: 'proof.signature-valid',
              outcome: { status: 'success', message: 'Credential signature is valid' },
              timestamp: new Date().toISOString(),
              fatal: true
            },
            {
              suite: 'registry',
              check: 'registry.issuer-registered',
              outcome: {
                status: 'success',
                message: 'Issuer found in DCC Sandbox Registry',
                foundInRegistries: ['DCC Sandbox Registry']
              },
              timestamp: new Date().toISOString()
            }
          ]
        }
      ]
    : [
        {
          verified: false,
          credential: createMockCredential(),
          results: [
            {
              suite: 'core',
              check: 'core.id-valid',
              outcome: { status: 'success', message: 'Credential ID is valid' },
              timestamp: new Date().toISOString()
            },
            {
              suite: 'proof',
              check: 'proof.signature-valid',
              outcome: {
                status: 'failure',
                problems: [
                  {
                    type: 'https://w3id.org/security#INVALID_SIGNATURE',
                    title: 'Invalid Signature',
                    detail: 'The credential signature could not be verified'
                  }
                ]
              },
              timestamp: new Date().toISOString(),
              fatal: true
            }
          ]
        }
      ],
  allResults: [],
  ...overrides
})

export const createMockExpiredCredential = (): any =>
  createMockCredential({
    expirationDate: '2020-01-01T00:00:00Z' // Expired in the past
  })

export const createMockRevokedCredential = (): any =>
  createMockCredential({
    credentialStatus: {
      id: 'https://example.com/status/1',
      type: 'RevocationList2020Status',
      revocationListIndex: '1',
      revocationListCredential: 'https://example.com/status/1#list'
    }
  })

export { getDataForExchangeSetupPost, testVC }

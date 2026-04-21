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
  verifiablePresentation: createMockPresentation([
    createMockCredential()
  ]) as unknown as import('@digitalcredentials/verifier-core').VerifiablePresentation,
  presentationResults: presentationValid
    ? [
        {
          id: 'cryptographic.proof.signature-valid',
          check: 'proof.signature-valid',
          suite: 'proof',
          outcome: { status: 'success', message: 'Presentation signature is valid' },
          fatal: true
        }
      ]
    : [
        {
          id: 'cryptographic.proof.signature-valid',
          check: 'proof.signature-valid',
          suite: 'proof',
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
          fatal: true
        }
      ],
  summary: presentationValid
    ? [
        {
          id: 'cryptographic.proof',
          phase: 'cryptographic',
          suite: 'proof',
          status: 'success',
          verified: true,
          message: '1 of 1 checks passed',
          counts: { passed: 1, failed: 0, skipped: 0 }
        }
      ]
    : [
        {
          id: 'cryptographic.proof',
          phase: 'cryptographic',
          suite: 'proof',
          status: 'failure',
          verified: false,
          message: '1 of 1 checks failed (0 passed)',
          counts: { passed: 0, failed: 1, skipped: 0 }
        }
      ],
  credentialResults: credentialsValid
    ? [
        {
          verified: true,
          verifiableCredential: createMockCredential(),
          summary: [
            {
              id: 'cryptographic.core',
              phase: 'cryptographic',
              suite: 'core',
              status: 'success',
              verified: true,
              message: '1 of 1 checks passed',
              counts: { passed: 1, failed: 0, skipped: 0 }
            },
            {
              id: 'cryptographic.proof',
              phase: 'cryptographic',
              suite: 'proof',
              status: 'success',
              verified: true,
              message: '1 of 1 checks passed',
              counts: { passed: 1, failed: 0, skipped: 0 }
            },
            {
              id: 'trust.registry',
              phase: 'trust',
              suite: 'registry',
              status: 'success',
              verified: true,
              message: '1 of 1 checks passed',
              counts: { passed: 1, failed: 0, skipped: 0 }
            }
          ],
          results: [
            {
              id: 'cryptographic.core.id-valid',
              check: 'core.id-valid',
              suite: 'core',
              outcome: { status: 'success', message: 'Credential ID is valid' }
            },
            {
              id: 'cryptographic.proof.signature-valid',
              check: 'proof.signature-valid',
              suite: 'proof',
              outcome: { status: 'success', message: 'Credential signature is valid' },
              fatal: true
            },
            {
              id: 'trust.registry.issuer-registered',
              check: 'registry.issuer-registered',
              suite: 'registry',
              outcome: {
                status: 'success',
                message: 'Issuer found in DCC Sandbox Registry',
                foundInRegistries: ['DCC Sandbox Registry']
              }
            }
          ]
        }
      ]
    : [
        {
          verified: false,
          verifiableCredential: createMockCredential(),
          summary: [
            {
              id: 'cryptographic.core',
              phase: 'cryptographic',
              suite: 'core',
              status: 'success',
              verified: true,
              message: '1 of 1 checks passed',
              counts: { passed: 1, failed: 0, skipped: 0 }
            },
            {
              id: 'cryptographic.proof',
              phase: 'cryptographic',
              suite: 'proof',
              status: 'failure',
              verified: false,
              message: '1 of 1 checks failed (0 passed)',
              counts: { passed: 0, failed: 1, skipped: 0 }
            }
          ],
          results: [
            {
              id: 'cryptographic.core.id-valid',
              check: 'core.id-valid',
              suite: 'core',
              outcome: { status: 'success', message: 'Credential ID is valid' }
            },
            {
              id: 'cryptographic.proof.signature-valid',
              check: 'proof.signature-valid',
              suite: 'proof',
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
              fatal: true
            }
          ]
        }
      ],
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

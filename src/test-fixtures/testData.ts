import testVC from './testVC.js'

/**
 * Generates test data for batch exchange creation (POST /exchange)
 *
 * @param tenantName - The tenant name for the exchange
 * @param exchangeHost - The exchange host URL (default: 'http://localhost:4005')
 * @param workflowId - The workflow ID ('didAuth' or 'claim', default: 'didAuth')
 * @returns Test data matching the exchangeBatchSchema format
 *
 * @remarks
 * - For 'claim' workflow, includes `vc` (test credential) in the data array
 * - For 'didAuth' workflow, includes `vc` for compatibility
 * - All entries include a `retrievalId` for tracking
 */
const getDataForExchangeSetupPost = (
  tenantName: string,
  exchangeHost = 'http://localhost:4005',
  workflowId = 'didAuth'
) => {
  const fakeData = {
    tenantName,
    exchangeHost,
    workflowId,
    data: [
      { vc: JSON.stringify(testVC), retrievalId: 'someId' },
      { vc: JSON.stringify(testVC), retrievalId: 'blah' }
    ],
    expires: new Date(Date.now() + 600000).toISOString() // 10 minutes from now
  }
  return fakeData
}

/**
 * Generates test data for VCALM exchange creation (POST /workflows/:workflowId/exchanges)
 *
 * @param tenantName - The tenant name for the exchange
 * @param exchangeHost - The exchange host URL (default: 'http://localhost:4005')
 * @param workflowId - The workflow ID ('didAuth' or 'claim', default: 'didAuth')
 * @returns Test data matching the vcApiExchangeCreateSchema format (ExchangeCreateInput)
 *
 * @remarks
 * - For 'claim' workflow, includes `vc` (test credential) in variables
 * - For 'didAuth' workflow, includes optional `vc` for compatibility
 * - Includes `retrievalId` in variables for tracking
 */
export const getDataForVcApiExchangeCreate = (
  tenantName: string,
  exchangeHost = 'http://localhost:4005',
  workflowId: 'didAuth' | 'claim' = 'didAuth'
): App.ExchangeCreateInput => {
  const variables: App.ExchangeCreateInput['variables'] = {
    tenantName,
    exchangeHost,
    retrievalId: 'test-retrieval-id'
  }

  // For claim workflow, include vc in variables
  if (workflowId === 'claim') {
    variables.vc = JSON.stringify(testVC)
  }

  return {
    variables,
    expires: new Date(Date.now() + 600000).toISOString() // 10 minutes from now
  }
}

/**
 * Creates a mock exchange object for a specific workflow type
 *
 * @param workflowId - The workflow type ('claim', 'didAuth', or 'verify')
 * @param overrides - Partial exchange data to override defaults
 * @returns A mock exchange object with all required variables for the workflow
 */
export const createMockExchangeForWorkflow = (
  workflowId: 'claim' | 'didAuth' | 'verify',
  overrides: Omit<Partial<App.ExchangeDetailBase>, 'variables'> & {
    variables?: Partial<App.ExchangeDetailBase['variables']>
  } = {}
): App.ExchangeDetailBase => {
  const baseExchange = {
    tenantName: 'default',
    exchangeId: 'test-exchange-id',
    workflowId,
    expires: new Date(Date.now() + 1000).toISOString(),
    state: 'active' as const,
    variables: {
      tenantName: 'default',
      exchangeHost: 'http://localhost:4005',
      challenge: 'test-challenge'
    }
  }

  // Add workflow-specific variables
  const variables: Record<string, any> = {
    ...baseExchange.variables
  }
  if (workflowId === 'claim') {
    variables.vc = JSON.stringify(testVC)
  }

  // Deep merge variables to preserve workflow-specific fields like vc
  const mergedVariables = {
    ...variables,
    ...(overrides.variables || {})
  }

  return {
    ...baseExchange,
    ...overrides,
    variables: mergedVariables
  } as App.ExchangeDetailBase
}

/**
 * Creates a mock exchange object for the claim workflow
 * Includes the required `vc` variable needed for credential template building
 *
 * @param overrides - Partial exchange data to override defaults. The `variables` field, if provided, can be a Partial of the base variables (challenge, exchangeHost, tenantName, vc).
 * @returns A mock claim exchange with all required variables
 */
export const createMockClaimExchange = (
  overrides: Omit<Partial<App.ExchangeDetailClaim>, 'variables'> & {
    variables?: Partial<App.ExchangeDetailClaim['variables']>
  } = {}
): App.ExchangeDetailClaim => {
  const baseVariables: App.ExchangeDetailClaim['variables'] = {
    tenantName: 'default',
    exchangeHost: 'http://localhost:4005',
    challenge: 'test-challenge',
    vc: JSON.stringify(testVC)
  }
  return createMockExchangeForWorkflow('claim', {
    variables: {
      ...baseVariables,
      ...overrides.variables
    } as App.ExchangeDetailClaim['variables'],
    ...overrides
  }) as App.ExchangeDetailClaim
}

/**
 * Creates a mock exchange object for the didAuth workflow
 *
 * @param overrides - Partial exchange data to override defaults
 * @returns A mock didAuth exchange with all required variables
 */
export const createMockDidAuthExchange = (
  overrides: Partial<App.ExchangeDetailDidAuth> = {}
): App.ExchangeDetailDidAuth => {
  return createMockExchangeForWorkflow(
    'didAuth',
    overrides
  ) as App.ExchangeDetailDidAuth
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
): any => ({
  presentationResult: {
    signature: presentationValid ? 'VALID' : 'INVALID',
    ...(presentationValid
      ? {}
      : {
          errors: [
            {
              name: 'INVALID_SIGNATURE',
              message: 'Invalid presentation signature'
            }
          ]
        })
  },
  credentialResults: credentialsValid
    ? [
        {
          credential: createMockCredential(),
          log: [
            { id: 'valid_signature', valid: true },
            { id: 'expiration', valid: true },
            { id: 'revocation_status', valid: true },
            {
              id: 'registered_issuer',
              valid: true,
              foundInRegistries: ['DCC Sandbox Registry'],
              registriesNotLoaded: []
            }
          ]
        }
      ]
    : [
        {
          credential: createMockCredential(),
          log: [
            { id: 'valid_signature', valid: false },
            { id: 'expiration', valid: true },
            { id: 'revocation_status', valid: true },
            {
              id: 'registered_issuer',
              valid: false,
              foundInRegistries: [],
              registriesNotLoaded: ['DCC Sandbox Registry']
            }
          ],
          errors: [
            {
              name: 'INVALID_SIGNATURE',
              message: 'Invalid credential signature'
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

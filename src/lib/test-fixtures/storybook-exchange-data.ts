/**
 * Lightweight Storybook exchange data generators
 * Frontend-safe: No backend dependencies, pure data generation
 */

/**
 * Minimal mock VC data (placeholder string)
 * Avoids importing testVC.js which may have backend dependencies
 */
const MOCK_VC_STRING = JSON.stringify({
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  type: ['VerifiableCredential'],
  credentialSubject: {
    id: 'did:example:test',
    name: 'Test Credential'
  }
})

/**
 * Creates a mock exchange object for a specific workflow type
 * Frontend-safe version without backend dependencies
 *
 * @param workflowId - The workflow type ('claim', 'didAuth', or 'verify')
 * @param overrides - Partial exchange data to override defaults
 * @returns A mock exchange object with all required variables for the workflow
 */
export function createStorybookExchangeData(
  workflowId: 'claim' | 'didAuth' | 'verify',
  overrides: Omit<Partial<App.ExchangeDetailBase>, 'variables'> & {
    variables?: Partial<App.ExchangeDetailBase['variables']>
  } = {}
): App.ExchangeDetailBase {
  const baseExchange = {
    tenantName: 'default',
    exchangeId: 'test-exchange-id',
    workflowId,
    expires: new Date(Date.now() + 600000).toISOString(), // 10 minutes from now
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
    variables.vc = MOCK_VC_STRING
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
export function createStorybookClaimExchange(
  overrides: Omit<Partial<App.ExchangeDetailClaim>, 'variables'> & {
    variables?: Partial<App.ExchangeDetailClaim['variables']>
  } = {}
): App.ExchangeDetailClaim {
  const baseVariables: App.ExchangeDetailClaim['variables'] = {
    tenantName: 'default',
    exchangeHost: 'http://localhost:4005',
    challenge: 'test-challenge',
    vc: MOCK_VC_STRING
  }
  return createStorybookExchangeData('claim', {
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
export function createStorybookDidAuthExchange(
  overrides: Partial<App.ExchangeDetailDidAuth> = {}
): App.ExchangeDetailDidAuth {
  return createStorybookExchangeData(
    'didAuth',
    overrides
  ) as App.ExchangeDetailDidAuth
}

/**
 * Creates a mock exchange object for the verify workflow
 *
 * @param overrides - Partial exchange data to override defaults
 * @returns A mock verify exchange with all required variables
 */
export function createStorybookVerifyExchange(
  overrides: Partial<App.ExchangeDetailVerify> = {}
): App.ExchangeDetailVerify {
  const baseVariables: App.ExchangeDetailVerify['variables'] = {
    tenantName: 'default',
    exchangeHost: 'http://localhost:4005',
    challenge: 'test-challenge',
    vprContext: ['https://www.w3.org/2018/credentials/v1'],
    vprCredentialType: ['VerifiableCredential'],
    trustedIssuers: [],
    vprClaims: []
  }
  const mergedVariables = {
    ...baseVariables,
    ...overrides.variables
  }
  return createStorybookExchangeData('verify', {
    variables: mergedVariables as App.ExchangeDetailVerify['variables'],
    ...overrides
  }) as App.ExchangeDetailVerify
}

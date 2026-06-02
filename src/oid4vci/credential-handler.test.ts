/**
 * Unit tests for the OID4VCI Credential Endpoint handler. The
 * happy-path / signing-service integration is covered by the Hono
 * integration test in `oid4vci.app.test.ts`; here we exercise the
 * error branches without spinning up the full app.
 */
import { describe, expect, test } from 'vitest'
import { handleCredentialRequest } from './credential-handler.js'
import { ensurePreAuthorizedCode, mintNonce, setAccessToken } from './state.js'

const fakeWorkflow: App.Workflow = {
  id: 'claim',
  steps: {
    claim: {
      createChallenge: true,
      verifiablePresentationRequest: { query: [{ type: 'DIDAuthentication' }] }
    }
  },
  initialStep: 'claim',
  credentialTemplates: [
    { id: 'generic', type: 'handlebars', template: '{{{vc}}}' }
  ]
}

const fakeConfig: App.Config = {
  port: 4004,
  defaultExchangeHost: 'https://issuer.example',
  exchangeTtl: 600,
  statusService: '',
  signingService: 'http://localhost:4006',
  defaultWorkflow: 'didAuth',
  defaultTenantName: 'default',
  uiShowDetails: true,
  accessJwtSecret: '',
  keyvWriteDelayMs: 50,
  keyvExpiredCheckDelayMs: 4 * 3600 * 1000,
  tenants: { default: { tenantName: 'default', tenantToken: 'tok' } },
  tenantAuthenticationEnabled: false,
  defaultTrustedRegistryNames: [],
  knownRegistries: {},
  defaultExchangeDebug: false,
  verifyTaskDeadlineMs: 60_000,
  verifyTaskMaxAttempts: 2
}

const baseExchange = (): App.ExchangeDetailClaim => ({
  tenantName: 'default',
  workflowId: 'claim',
  exchangeId: 'abc-123',
  expires: new Date(Date.now() + 60_000).toISOString(),
  state: 'pending',
  variables: {
    challenge: 'chal',
    exchangeHost: 'https://issuer.example',
    vc: '{"@context":["https://www.w3.org/ns/credentials/v2"],"type":["VerifiableCredential","OpenBadgeCredential"],"credentialSubject":{}}'
  }
})

const seededWithTokenAndNonce = (): App.ExchangeDetailClaim => {
  const seeded = ensurePreAuthorizedCode(baseExchange(), 600)
  const tokenStamped = setAccessToken(seeded.exchange, 600)
  return mintNonce(tokenStamped.exchange, 300).exchange
}

const validBody = (configId = 'OpenBadgeCredential', vp: object = {}) => ({
  credential_configuration_id: configId,
  proofs: { di_vp: [vp] }
})

describe('handleCredentialRequest', () => {
  test('returns 401 when access token is missing', async () => {
    const r = await handleCredentialRequest({
      accessToken: undefined,
      body: validBody(),
      exchange: seededWithTokenAndNonce(),
      workflow: fakeWorkflow,
      config: fakeConfig
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(401)
      expect(r.body.error).toBe('invalid_token')
    }
  })

  test('returns 401 when access token is wrong', async () => {
    const r = await handleCredentialRequest({
      accessToken: 'not-the-token',
      body: validBody(),
      exchange: seededWithTokenAndNonce(),
      workflow: fakeWorkflow,
      config: fakeConfig
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(401)
      expect(r.body.error).toBe('invalid_token')
    }
  })

  test('returns invalid_credential_request when body is malformed', async () => {
    const ex = seededWithTokenAndNonce()
    const r = await handleCredentialRequest({
      accessToken: ex.variables.oid4vci!.accessToken!,
      body: { not: 'a credential request' },
      exchange: ex,
      workflow: fakeWorkflow,
      config: fakeConfig
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(400)
      expect((r.body as { error: string }).error).toBe(
        'invalid_credential_request'
      )
    }
  })

  test('returns unknown_credential_configuration when configId does not match the offer', async () => {
    const ex = seededWithTokenAndNonce()
    const r = await handleCredentialRequest({
      accessToken: ex.variables.oid4vci!.accessToken!,
      body: validBody('Made-Up-Credential', {
        proof: { challenge: ex.variables.oid4vci!.cNonce! }
      }),
      exchange: ex,
      workflow: fakeWorkflow,
      config: fakeConfig
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect((r.body as { error: string }).error).toBe(
        'unknown_credential_configuration'
      )
    }
  })

  test('returns invalid_proof when proofs.di_vp[0] has no challenge', async () => {
    const ex = seededWithTokenAndNonce()
    const r = await handleCredentialRequest({
      accessToken: ex.variables.oid4vci!.accessToken!,
      body: validBody('OpenBadgeCredential', { proof: {} }),
      exchange: ex,
      workflow: fakeWorkflow,
      config: fakeConfig
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect((r.body as { error: string }).error).toBe('invalid_proof')
    }
  })

  test('returns invalid_nonce when challenge does not match', async () => {
    const ex = seededWithTokenAndNonce()
    const r = await handleCredentialRequest({
      accessToken: ex.variables.oid4vci!.accessToken!,
      body: validBody('OpenBadgeCredential', {
        proof: { challenge: 'wrong-nonce' }
      }),
      exchange: ex,
      workflow: fakeWorkflow,
      config: fakeConfig
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect((r.body as { error: string }).error).toBe('invalid_nonce')
    }
  })
})


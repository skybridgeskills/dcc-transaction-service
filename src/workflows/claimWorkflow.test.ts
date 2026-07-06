/**
 * Unit tests for the VC-API `claim` workflow's holder-DID binding.
 *
 * The issued `credentialSubject.id` is bound to the holder returned by
 * `verifyDIDAuth` — the entity that cryptographically signed the DIDAuth
 * proof — never the self-asserted top-level `holder` field. A presented
 * `holder` that disagrees with the verified signer is rejected, and a
 * missing verified holder never yields a subject-less credential.
 *
 * `verifyDIDAuth`, the signing service call, and exchange persistence are
 * mocked so these tests exercise only the binding + mismatch path.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { HTTPException } from 'hono/http-exception'

const HOLDER = 'did:key:z6MknGSUtEUXvNgx4yqftKjv6mLCAzjEmttB2FcvucADYgZN'

const verifyDIDAuthMock = vi.fn(async () => ({ verified: true, holder: HOLDER }))
const callServiceMock = vi.fn(
  async (_endpoint: string, body: Record<string, unknown>) => body
)
const saveExchangeMock = vi.fn(async () => {})

vi.mock('../didAuth.js', () => ({
  verifyDIDAuth: verifyDIDAuthMock
}))

vi.mock('../transactionManager.js', () => ({
  saveExchange: saveExchangeMock
}))

vi.mock('../utils.js', async (importActual) => {
  const actual = await importActual<typeof import('../utils.js')>()
  return { ...actual, callService: callServiceMock }
})

const { participateInClaimExchange, signClaimCredentialFromHolderDid } =
  await import('./claimWorkflow.js')
const { getWorkflow } = await import('../workflows.js')

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

const vcTemplate = JSON.stringify({
  '@context': ['https://www.w3.org/ns/credentials/v2'],
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  name: 'LER Interop Test Credential',
  credentialSubject: {
    id: '{{HOLDER_DID}}',
    type: ['AchievementSubject']
  }
})

const baseExchange = (): App.ExchangeDetailClaim => ({
  tenantName: 'default',
  workflowId: 'claim',
  exchangeId: 'abc-123',
  expires: new Date(Date.now() + 60_000).toISOString(),
  state: 'active',
  variables: {
    challenge: 'chal',
    exchangeHost: 'https://issuer.example',
    vc: vcTemplate
  }
})

const proof = {
  type: 'DataIntegrityProof',
  created: '2026-07-02T14:53:05Z',
  verificationMethod: `${HOLDER}#${HOLDER.slice('did:key:'.length)}`,
  cryptosuite: 'eddsa-rdfc-2022',
  proofPurpose: 'authentication',
  challenge: 'chal',
  proofValue: 'zTestProofValue'
}

const wrappedPresentation = (holder?: unknown) => ({
  verifiablePresentation: {
    '@context': ['https://www.w3.org/ns/credentials/v2'],
    type: ['VerifiablePresentation'],
    ...(holder !== undefined ? { holder } : {}),
    proof
  }
})

const barePresentation = (holder?: unknown) => ({
  '@context': ['https://www.w3.org/ns/credentials/v2'],
  type: ['VerifiablePresentation'],
  ...(holder !== undefined ? { holder } : {}),
  proof
})

const issuedCredential = (result: unknown) =>
  (result as { verifiableCredential: App.Credential[] }).verifiableCredential[0]

describe('participateInClaimExchange — holder DID binding', () => {
  beforeEach(() => {
    verifyDIDAuthMock.mockClear()
    callServiceMock.mockClear()
    saveExchangeMock.mockClear()
  })

  test('binds credentialSubject.id from a wrapped VC-API envelope', async () => {
    const result = await participateInClaimExchange({
      data: wrappedPresentation(HOLDER),
      exchange: baseExchange(),
      workflow: getWorkflow('claim'),
      config: fakeConfig
    })

    expect(issuedCredential(result).credentialSubject.id).toBe(HOLDER)
  })

  test('binds credentialSubject.id from a bare presentation body', async () => {
    const result = await participateInClaimExchange({
      data: barePresentation(HOLDER),
      exchange: baseExchange(),
      workflow: getWorkflow('claim'),
      config: fakeConfig
    })

    expect(issuedCredential(result).credentialSubject.id).toBe(HOLDER)
  })

  test('binds credentialSubject.id from an object-form holder ({ id })', async () => {
    const result = await participateInClaimExchange({
      data: wrappedPresentation({ id: HOLDER }),
      exchange: baseExchange(),
      workflow: getWorkflow('claim'),
      config: fakeConfig
    })

    expect(issuedCredential(result).credentialSubject.id).toBe(HOLDER)
  })

  test('binds to the verified signer even when the body omits `holder`', async () => {
    // The holder comes from the proof signer (verifyDIDAuth), so a body
    // without a top-level `holder` still yields a correctly-bound subject.
    const result = await participateInClaimExchange({
      data: wrappedPresentation(),
      exchange: baseExchange(),
      workflow: getWorkflow('claim'),
      config: fakeConfig
    })

    expect(issuedCredential(result).credentialSubject.id).toBe(HOLDER)
  })

  test('throws 401 and does not sign when the proof yields no verified holder', async () => {
    verifyDIDAuthMock.mockResolvedValueOnce({
      verified: true
    } as unknown as { verified: true; holder: string })

    await expect(
      participateInClaimExchange({
        data: wrappedPresentation(HOLDER),
        exchange: baseExchange(),
        workflow: getWorkflow('claim'),
        config: fakeConfig
      })
    ).rejects.toBeInstanceOf(HTTPException)

    // The guard fires before the signing service is called, so no
    // unbound credential is ever issued.
    expect(callServiceMock).not.toHaveBeenCalled()
  })

  test('throws 401 when the self-asserted holder disagrees with the signer', async () => {
    // verifyDIDAuth verified the proof was signed by HOLDER, but the body
    // claims a different holder — a spoof attempt. Must be rejected, unsigned.
    await expect(
      participateInClaimExchange({
        data: wrappedPresentation('did:example:someone-else'),
        exchange: baseExchange(),
        workflow: getWorkflow('claim'),
        config: fakeConfig
      })
    ).rejects.toBeInstanceOf(HTTPException)

    expect(callServiceMock).not.toHaveBeenCalled()
  })
})

describe('signClaimCredentialFromHolderDid — guard', () => {
  beforeEach(() => {
    callServiceMock.mockClear()
    saveExchangeMock.mockClear()
  })

  test('throws HTTPException(401) when holderDid is undefined', async () => {
    await expect(
      signClaimCredentialFromHolderDid({
        holderDid: undefined,
        exchange: baseExchange(),
        workflow: getWorkflow('claim'),
        config: fakeConfig,
        walletCryptosuites: []
      })
    ).rejects.toBeInstanceOf(HTTPException)

    expect(callServiceMock).not.toHaveBeenCalled()
  })
})

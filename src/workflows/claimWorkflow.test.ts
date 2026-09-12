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
import { AxiosError, AxiosHeaders } from 'axios'
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

const {
  createExchangeClaim,
  participateInClaimExchange,
  signClaimCredentialFromHolderDid,
  validateExchangeClaim
} = await import('./claimWorkflow.js')
const { getWorkflow } = await import('../workflows.js')

const fakeConfig: App.Config = {
  port: 4004,
  defaultExchangeHost: 'https://issuer.example',
  exchangeTtl: 600,
  statusService: '',
  statusServiceToken: '',
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

// VC-API returns the presentation wrapped: `{ verifiablePresentation: VP }`.
const issuedCredential = (result: unknown) =>
  (
    result as {
      verifiablePresentation: { verifiableCredential: App.Credential[] }
    }
  ).verifiablePresentation.verifiableCredential[0]

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

describe('signClaimCredentialFromHolderDid — the upstream cause survives', () => {
  beforeEach(() => {
    callServiceMock.mockClear()
    saveExchangeMock.mockClear()
  })

  const withStatusService: App.Config = {
    ...fakeConfig,
    statusService: 'http://status.example',
    statusServiceToken: 'status-token'
  }

  /** The status service's refusal, in the envelope it actually sends. */
  const alreadyAllocated = () => {
    const headers = new AxiosHeaders()
    const requestConfig = { headers }
    return new AxiosError(
      'Request failed with status code 409',
      AxiosError.ERR_BAD_REQUEST,
      requestConfig,
      {},
      {
        status: 409,
        statusText: 'Conflict',
        data: {
          code: 409,
          message: 'Credential already allocated a status index.',
          problemDetails: [
            {
              type: 'https://www.w3.org/TR/vc-data-model#CREDENTIAL_ALREADY_ALLOCATED',
              status: 409,
              title: 'CREDENTIAL_ALREADY_ALLOCATED',
              detail: 'This credential id already has a status list index.'
            }
          ]
        },
        headers,
        config: requestConfig
      }
    )
  }

  test('a status-service 409 reaches the caller as a 409 with problem details', async () => {
    // It used to arrive as a bare 500, and the 500 was read as a status-list
    // bug it never was. Nothing about the upstream changed — we were
    // discarding an answer we already had.
    callServiceMock.mockRejectedValueOnce(alreadyAllocated())

    const thrown = await signClaimCredentialFromHolderDid({
      holderDid: HOLDER,
      exchange: baseExchange(),
      workflow: getWorkflow('claim'),
      config: withStatusService,
      walletCryptosuites: []
    }).catch((e: unknown) => e)

    expect(thrown).toBeInstanceOf(HTTPException)
    const exception = thrown as HTTPException
    expect(exception.status).toBe(409)
    expect(
      (exception.cause as { problemDetails: Array<{ title: string }> })
        .problemDetails[0]!.title
    ).toBe('CREDENTIAL_ALREADY_ALLOCATED')
  })

  test('a failed allocation never reaches the signing service', async () => {
    callServiceMock.mockRejectedValueOnce(alreadyAllocated())

    await signClaimCredentialFromHolderDid({
      holderDid: HOLDER,
      exchange: baseExchange(),
      workflow: getWorkflow('claim'),
      config: withStatusService,
      walletCryptosuites: []
    }).catch(() => undefined)

    expect(callServiceMock).toHaveBeenCalledTimes(1)
    expect(saveExchangeMock).not.toHaveBeenCalled()
  })
})

describe('signClaimCredentialFromHolderDid — the issuer this service sends', () => {
  // Identity is the signing service's: `addIssuerId` derives `issuer.id` from
  // the tenant seed and sets it on an object issuer in place. So these assert
  // only what this service *posts* — the final id is covered by the signing
  // service's own suite. Writing a bare string here would be invisible in the
  // resulting id and would silently destroy the issuer's name/url/description.
  beforeEach(() => {
    callServiceMock.mockClear()
    saveExchangeMock.mockClear()
  })

  const issuerProfile = {
    id: 'https://issuer.example/profile',
    type: ['Profile'],
    name: 'Example Issuer',
    url: 'https://issuer.example',
    description: 'An issuer with an instance configured.'
  }

  const withIssuerInstance: App.Config = {
    ...fakeConfig,
    tenants: {
      default: {
        tenantName: 'default',
        tenantToken: 'tok',
        issuerInstances: [
          {
            id: 'did:web:issuer.example:ui:example-tenant',
            cryptosuite: 'eddsa-rdfc-2022',
            signingServiceTenant: 'example-tenant'
          }
        ]
      }
    }
  }

  const exchangeIssuing = (issuer: unknown): App.ExchangeDetailClaim => ({
    ...baseExchange(),
    variables: {
      ...baseExchange().variables,
      vc: JSON.stringify({ ...JSON.parse(vcTemplate), issuer })
    }
  })

  /** The body posted to the signing service. */
  const signedBody = () =>
    callServiceMock.mock.calls[0]![1] as { issuer?: unknown }

  const signingUrl = () => callServiceMock.mock.calls[0]![0]

  test('an object issuer survives the claim path intact', async () => {
    await signClaimCredentialFromHolderDid({
      holderDid: HOLDER,
      exchange: exchangeIssuing(issuerProfile),
      workflow: getWorkflow('claim'),
      config: withIssuerInstance,
      walletCryptosuites: []
    })

    expect(signedBody().issuer).toEqual(issuerProfile)
  })

  test('a string issuer is passed through untouched', async () => {
    // Replacing it is the signing service's job; pre-empting that here would
    // only hide which tenant the caller asked for.
    await signClaimCredentialFromHolderDid({
      holderDid: HOLDER,
      exchange: exchangeIssuing('did:web:someone.example'),
      workflow: getWorkflow('claim'),
      config: withIssuerInstance,
      walletCryptosuites: []
    })

    expect(signedBody().issuer).toBe('did:web:someone.example')
  })

  test('the signing tenant still comes from the issuer instance', async () => {
    // A regression guard: `issuerInstance` selects the instance and the signing
    // tenant, and that job survives the removal of the issuer assignment.
    await signClaimCredentialFromHolderDid({
      holderDid: HOLDER,
      exchange: exchangeIssuing(issuerProfile),
      workflow: getWorkflow('claim'),
      config: withIssuerInstance,
      walletCryptosuites: []
    })

    expect(signingUrl()).toBe(
      'http://localhost:4006/instance/example-tenant/credentials/sign'
    )
  })
})

describe('createExchangeClaim — a fresh credential id per exchange', () => {
  const idOf = (exchange: App.ExchangeDetailClaim) =>
    (JSON.parse(exchange.variables.vc) as { id?: string }).id

  const create = (vc: string) =>
    createExchangeClaim({
      data: validateExchangeClaim({
        variables: { tenantName: 'default', exchangeHost: 'https://issuer.example', vc }
      }),
      config: fakeConfig
    })

  test('two exchanges from one template carry different credential ids', () => {
    // A credential id is not the caller's to reuse: the status service gives
    // one revocation index per id and correctly refuses a second. A fixed id
    // in a template is invisible until the second issuance.
    const first = idOf(create(vcTemplate))
    const second = idOf(create(vcTemplate))

    expect(first).toMatch(
      /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
    expect(second).not.toBe(first)
  })

  test('a caller-supplied id is overwritten, not preserved', () => {
    const fixed = JSON.stringify({
      ...JSON.parse(vcTemplate),
      id: 'urn:uuid:the-same-every-time'
    })

    expect(idOf(create(fixed))).not.toBe('urn:uuid:the-same-every-time')
  })

  test('nothing else about the template is disturbed', () => {
    const { id: _stamped, ...rest } = JSON.parse(
      create(vcTemplate).variables.vc
    ) as Record<string, unknown>

    expect(rest).toEqual(JSON.parse(vcTemplate))
  })
})

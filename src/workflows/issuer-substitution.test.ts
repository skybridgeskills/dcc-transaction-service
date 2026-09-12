/**
 * `tamper: 'issuer'` — the spoofed-source fixture.
 *
 * The question is whether a wallet checks WHO signed a credential, not merely
 * that a signature is present and verifies. The condition worth catching is
 * *accepts a credential from a spoofed source*, and the fixture that produces
 * it is a credential that **names issuer Y while carrying a proof by X**.
 *
 * ## ⚠️ What these tests assert, and why it is not `applyTamper`'s return value
 *
 * The defect class this has already produced three times
 * (`acceptedMethods`, the `proof` array, the `created` pre-check) is **a test
 * that encodes our assumption as intent** — asserting our own builder's output
 * instead of the artifact that leaves the service. So these drive
 * `signClaimCredentialFromHolderDid` end to end with a signing double that
 * behaves the way the real signing service does — `addIssuerId` **overwrites**
 * `issuer.id` from the tenant seed — and assert the credential that comes back
 * out. A test that called `applyTamper` directly would pass even if the
 * substitution were applied before signing, where it would be silently undone.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'

const HOLDER = 'did:key:z6MknGSUtEUXvNgx4yqftKjv6mLCAzjEmttB2FcvucADYgZN'

/** The identity the signing service signs as — the proof's real author. */
const SIGNER_DID = 'did:web:issuer.example:ui:test-issuer'
/** The identity the fixture declares — the spoofed source. */
const DECLARED_DID = 'did:web:some-other-issuer.example'

const verifyDIDAuthMock = vi.fn(async () => ({
  verified: true,
  holder: HOLDER
}))
const saveExchangeMock = vi.fn(async () => {})

/**
 * Stands in for `dcc-signing-service`'s credential-signing endpoint.
 *
 * ⚠️ The load-bearing behaviour is `addIssuerId`: it sets `.id` on the issuer
 * OBJECT from the tenant seed, **regardless of what the profile declared**, and
 * leaves the rest of the object alone. Without that overwrite these tests would
 * pass against a build that never substituted anything.
 */
const callServiceMock = vi.fn(
  async (_endpoint: string, body: Record<string, unknown>) => {
    const signed = JSON.parse(JSON.stringify(body)) as Record<string, unknown>
    const issuer = signed.issuer
    if (issuer && typeof issuer === 'object') {
      ;(issuer as Record<string, unknown>).id = SIGNER_DID
    } else {
      signed.issuer = SIGNER_DID
    }
    signed.proof = {
      type: 'DataIntegrityProof',
      cryptosuite: 'eddsa-rdfc-2022',
      verificationMethod: `${SIGNER_DID}#key-1`,
      proofValue:
        'z4oey5q2M3XKaxup3tmzN4DRFTLVqpLMweBrSxMY2xHX5XTYVQeVbY8nQAVHMrXFkXJpmEcqdoDwLWxaqA3Q1geV6'
    }
    return signed
  }
)

vi.mock('../didAuth.js', () => ({ verifyDIDAuth: verifyDIDAuthMock }))
vi.mock('../transactionManager.js', () => ({ saveExchange: saveExchangeMock }))
vi.mock('../utils.js', async (importActual) => {
  const actual = await importActual<typeof import('../utils.js')>()
  return { ...actual, callService: callServiceMock }
})

const { signClaimCredentialFromHolderDid } = await import('./claimWorkflow.js')
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

const templateWithIssuer = (issuerId?: string) =>
  JSON.stringify({
    '@context': ['https://www.w3.org/ns/credentials/v2'],
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    name: 'Interop Test Credential',
    ...(issuerId
      ? {
          issuer: {
            id: issuerId,
            type: 'Profile',
            name: 'Test Issuer',
            url: 'https://issuer.example/ui/test-issuer/'
          }
        }
      : {}),
    credentialSubject: { id: '{{HOLDER_DID}}', type: ['AchievementSubject'] }
  })

const exchangeWith = (
  vc: string,
  tamper?: 'proof' | 'claim' | 'issuer'
): App.ExchangeDetailClaim => ({
  tenantName: 'default',
  workflowId: 'claim',
  exchangeId: 'abc-123',
  expires: new Date(Date.now() + 60_000).toISOString(),
  state: 'active',
  variables: {
    challenge: 'chal',
    exchangeHost: 'https://issuer.example',
    vc,
    ...(tamper ? { tamper } : {})
  }
})

const sign = (exchange: App.ExchangeDetailClaim) =>
  signClaimCredentialFromHolderDid({
    holderDid: HOLDER,
    exchange,
    workflow: getWorkflow('claim'),
    config: fakeConfig,
    walletCryptosuites: []
  })

const issuerIdOf = (credential: unknown): string | undefined => {
  const issuer = (credential as Record<string, unknown> | undefined)?.issuer
  return typeof issuer === 'string'
    ? issuer
    : ((issuer as Record<string, unknown> | undefined)?.id as
        | string
        | undefined)
}

beforeEach(() => {
  callServiceMock.mockClear()
  saveExchangeMock.mockClear()
})

describe('the control — a profile-declared issuer is discarded without the mode', () => {
  test('the signing service overwrites it, which is why substitution is post-signing', async () => {
    const credential = await sign(
      exchangeWith(templateWithIssuer(DECLARED_DID))
    )

    // The declaration reached the signing service...
    const sent = callServiceMock.mock.calls[0]![1] as Record<string, unknown>
    expect(issuerIdOf(sent)).toBe(DECLARED_DID)
    // ...and came back overwritten. This is the behaviour that makes
    // pre-signing substitution unavailable to us.
    expect(issuerIdOf(credential)).toBe(SIGNER_DID)
  })
})

describe("tamper: 'issuer' — the emitted credential names Y and is proved by X", () => {
  test('the issuer id on the EMITTED credential is the declared one', async () => {
    const credential = await sign(
      exchangeWith(templateWithIssuer(DECLARED_DID), 'issuer')
    )
    expect(issuerIdOf(credential)).toBe(DECLARED_DID)
  })

  test('the proof is untouched and still names the real signer', async () => {
    const credential = await sign(
      exchangeWith(templateWithIssuer(DECLARED_DID), 'issuer')
    )
    const proof = (credential as unknown as Record<string, unknown>).proof as
      | Record<string, unknown>
      | undefined
    // ⚠️ The whole fixture is this disagreement: named issuer ≠ proof author.
    expect(proof?.verificationMethod).toBe(`${SIGNER_DID}#key-1`)
    expect(issuerIdOf(credential)).not.toBe(SIGNER_DID)
  })

  test('the displayed issuer metadata survives, so it presents as Y on screen', async () => {
    const credential = await sign(
      exchangeWith(templateWithIssuer(DECLARED_DID), 'issuer')
    )
    const issuer = (credential as unknown as Record<string, unknown>).issuer as
      | Record<string, unknown>
      | undefined
    // Replacing the whole issuer object would strip what a wallet DISPLAYS,
    // and the fixture is about what a human reading the card would believe.
    expect(issuer?.name).toBe('Test Issuer')
    expect(issuer?.id).toBe(DECLARED_DID)
  })

  test('the OTHER modes leave the issuer alone', async () => {
    const credential = await sign(
      exchangeWith(templateWithIssuer(DECLARED_DID), 'claim')
    )
    expect(issuerIdOf(credential)).toBe(SIGNER_DID)
  })
})

describe('⚠️ a fixture that would test nothing REFUSES to be built', () => {
  test('declaring the signer itself throws rather than emitting a no-op', async () => {
    // The arm would be indistinguishable from an untampered issuance, and the
    // minutes spent inspecting it by hand would buy nothing.
    await expect(
      sign(exchangeWith(templateWithIssuer(SIGNER_DID), 'issuer'))
    ).rejects.toThrow(/no-op/)
  })

  test('declaring no issuer at all throws rather than emitting a no-op', async () => {
    await expect(
      sign(exchangeWith(templateWithIssuer(undefined), 'issuer'))
    ).rejects.toThrow(/declared none/)
  })
})

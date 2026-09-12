/**
 * Unit tests for the OID4VCI Credential Endpoint handler. The
 * happy-path / signing-service integration is covered by the Hono
 * integration test in `oid4vci.app.test.ts`; here we exercise the
 * error branches without spinning up the full app.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as config from '../config.js'
import { flushJournal, type JournalEntry } from '../journal/index.js'
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

describe('handleCredentialRequest — unsupported proof type vs malformed request', () => {
  // Both are a `400 invalid_credential_request` on the wire and must stay
  // that way; the journal is where they stop being the same finding. A
  // 1.0-conformant wallet sending `proofs: { jwt: [...] }` is legal under the
  // spec and outside our profile — a statement about us. A body we could not
  // read is a statement about the wallet.
  let directory: string
  let journalPath: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'credential-request-'))
    journalPath = join(directory, 'journal.jsonl')
    const current = config.getConfig()
    vi.spyOn(config, 'getConfig').mockImplementation(() => ({
      ...current,
      exchangeJournalPath: journalPath
    }))
  })

  afterEach(async () => {
    await flushJournal()
    vi.restoreAllMocks()
    await rm(directory, { recursive: true, force: true })
  })

  const reject = async (body: unknown) => {
    const ex = seededWithTokenAndNonce()
    const result = await handleCredentialRequest({
      accessToken: ex.variables.oid4vci!.accessToken!,
      body,
      exchange: ex,
      workflow: fakeWorkflow,
      config: fakeConfig
    })
    await flushJournal()
    const entries = (await readFile(journalPath, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as JournalEntry)
    return { result, detail: entries[0]!.detail! }
  }

  test('a supported-request shape asking in an unsupported proof type', async () => {
    const { result, detail } = await reject({
      credential_configuration_id: 'OpenBadgeCredential',
      proofs: { jwt: ['ey...'] }
    })

    expect(detail).toMatchObject({
      stage: 'oid4vci-credential-request',
      reason: 'unsupported-proof-type',
      proofTypesOffered: ['jwt']
    })
    // The response is unchanged — this item is diagnostic only.
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect((result.body as { error: string }).error).toBe(
        'invalid_credential_request'
      )
    }
  })

  test('a body with no `proofs` object at all is a malformed request', async () => {
    const { detail } = await reject({ not: 'a credential request' })

    expect(detail).toMatchObject({ reason: 'malformed-request' })
    expect(detail).not.toHaveProperty('proofTypesOffered')
    expect(detail.issues).toBeDefined()
  })

  test('a singular `proof` is a draft-shaped request, not a malformed one', async () => {
    // Draft-13 shape. We implement 1.0-final and no drafts, so the 400 stands
    // — but the request is well-formed under the spec the wallet implements,
    // and `malformed-request` would blame the wallet for our version floor.
    // Draft-shaped requests are ordinary among shipping wallets.
    const { detail } = await reject({
      format: 'ldp_vc',
      proof: { proof_type: 'jwt', jwt: 'ey..' }
    })

    expect(detail).toMatchObject({
      reason: 'draft-shaped-request',
      proofTypesOffered: ['jwt']
    })
  })

  test('a draft request offering a type we DO support is still draft-shaped', async () => {
    // The trap the ordering exists for: `di_vp` is our own proof type, so a
    // test on the offered type alone finds nothing wrong and falls through to
    // `malformed-request` — the exact misattribution, on the shape most
    // likely to arrive from a wallet that has read our metadata.
    const { detail } = await reject({
      credential_configuration_id: 'OpenBadgeCredential',
      proof: { proof_type: 'di_vp', di_vp: {} }
    })

    expect(detail).toMatchObject({
      reason: 'draft-shaped-request',
      proofTypesOffered: ['di_vp']
    })
  })

  test('a `proof` object with no `proof_type` is malformed, not draft-shaped', async () => {
    // `proof_type` is what makes a draft body legible. Without it there is no
    // version to attribute the failure to, and the honest answer is that we
    // could not read the request.
    const { detail } = await reject({
      credential_configuration_id: 'OpenBadgeCredential',
      proof: { jwt: 'ey..' }
    })

    expect(detail).toMatchObject({ reason: 'malformed-request' })
    expect(detail).not.toHaveProperty('proofTypesOffered')
  })

  test('1.0-final `proofs` still wins over a stray singular `proof`', async () => {
    // A body carrying both is a 1.0-final request by construction — `proofs`
    // is the member 1.0-final defines — and must keep its 1.0-final reading.
    const { detail } = await reject({
      credential_configuration_id: 'OpenBadgeCredential',
      proofs: { jwt: ['ey...'] },
      proof: { proof_type: 'di_vp' }
    })

    expect(detail).toMatchObject({
      reason: 'unsupported-proof-type',
      proofTypesOffered: ['jwt']
    })
  })

  test('`proofs: { di_vp: [] }` is malformed — the type is ours, the value is not', async () => {
    const { detail } = await reject({
      credential_configuration_id: 'OpenBadgeCredential',
      proofs: { di_vp: [] }
    })

    expect(detail).toMatchObject({
      reason: 'malformed-request',
      proofTypesOffered: ['di_vp']
    })
  })
})

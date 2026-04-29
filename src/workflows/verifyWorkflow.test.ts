import * as config from '../config.js'
import { afterEach, beforeEach, expect, test, describe } from 'vitest'
import type {
  CheckResult,
  CredentialVerificationResult,
  PresentationVerificationResult,
  Verifier
} from '@digitalcredentials/verifier-core'
import { getWorkflow } from '../workflows.js'
import {
  createExchangeVerify,
  validateExchangeVerify,
  applyVerificationResults,
  getVerifyVPR,
  identifyOpenBadgesCredentialIndices,
  participateInVerifyExchange,
  preparePresentationForVerify
} from './verifyWorkflow.js'
import {
  createMockExchange,
  createMockCredential,
  createMockVerifierCoreResult
} from '../test-fixtures/testData.js'
import { getWalletInteractionUrl } from '../lib/wallets/index.js'
import { participateInExchange } from '../exchanges.js'
import { HTTPException } from 'hono/http-exception'
import type { ProblemDetailResponse } from '../lib/errors/problem-details.js'
import { resetVerifier } from '../lib/verifier.js'
import {
  peekVerifyTaskQueueForTests,
  resetVerifyTaskQueueForTests,
  setVerifyTaskProcessorForTests
} from '../lib/verify-task/enqueue-verify-task.js'
import { processVerifyTask } from '../lib/verify-task/verify-task-worker.js'
import {
  clearKeyv,
  getExchangeData,
  initializeTransactionManager,
  saveExchange
} from '../transactionManager.js'

const testData = {
  workflowId: 'verify',
  variables: {
    tenantName: 'test',
    vprContext: ['https://w3id.org/security/suites/ed25519-2020/v1'],
    vprCredentialType: ['https://w3id.org/security/suites/ed25519-2020/v1'],
    trustedIssuers: [
      'did:key:z6Mko3vgms1K7mccKpUEKQivWdM5BefHfSJEF4XAXofXaGJC'
    ],
    trustedRegistries: ['DCC Sandbox Registry'],
    vprClaims: [
      {
        path: ['credentialSubject.achievement.id'],
        values: ['urn:uuid:213e594f-a9f6-4171-b8e6-027b66624fc7']
      }
    ]
  }
}

describe('verifyWorkflowSchema', function () {
  test('can validate verify exchange variables', function () {
    const validated = validateExchangeVerify(testData)
    expect(validated).toBeDefined()
    expect(validated.variables.tenantName).toBe('test')
    expect(validated.variables.vprContext).toBeDefined()
    expect(validated.variables.vprCredentialType).toBeDefined()
    expect(validated.variables.trustedIssuers).toBeDefined()
    expect(validated.variables.trustedRegistries).toBeDefined()
    expect(validated.variables.vprClaims).toBeDefined()
    expect(validated.variables.vprClaims?.[0]?.path[0]).toEqual(
      'credentialSubject.achievement.id'
    )
    expect(validated.variables.vprClaims?.[0]?.values?.[0]).toEqual(
      'urn:uuid:213e594f-a9f6-4171-b8e6-027b66624fc7'
    )
  })

  test('can validate exchange with trustedRegistries', function () {
    const dataWithRegistries = {
      ...testData,
      variables: {
        ...testData.variables,
        trustedRegistries: ['Custom Registry', 'Another Registry']
      }
    }
    const validated = validateExchangeVerify(dataWithRegistries)
    expect(validated.variables.trustedRegistries).toEqual([
      'Custom Registry',
      'Another Registry'
    ])
  })
})

describe('verifyWorkflow', function () {
  test('can create exchange', function () {
    const validated = validateExchangeVerify(testData)
    const exchange = createExchangeVerify({
      workflow: getWorkflow('verify'),
      data: validated,
      config: config.getConfig()
    })
    expect(exchange).toBeDefined()
    expect(exchange.workflowId).toBe('verify')
    expect(exchange.variables.trustedRegistries).toEqual([
      'DCC Sandbox Registry'
    ])
    expect(exchange.variables.features).toEqual({
      details: config.getConfig().uiShowDetails
    })
  })
})

describe('applyVerificationResults', function () {
  test('sets exchange state to complete for valid verification', async function () {
    const exchange = createMockExchange()
    const result = createMockVerifierCoreResult(true, true)

    const updatedExchange = await applyVerificationResults({ exchange, result })

    expect(updatedExchange.state).toBe('complete')
    expect(updatedExchange.variables.results).toBeDefined()
    expect(updatedExchange.variables.results!.default.verified).toBe(true)
  })

  test('sets exchange state to invalid for invalid presentation signature', async function () {
    const exchange = createMockExchange()
    const result = createMockVerifierCoreResult(false, true)

    const updatedExchange = await applyVerificationResults({ exchange, result })

    expect(updatedExchange.state).toBe('invalid')
    expect(updatedExchange.variables.results!.default.verified).toBe(false)
  })

  test('sets exchange state to invalid for invalid credential signature', async function () {
    const exchange = createMockExchange()
    const result = createMockVerifierCoreResult(true, false)

    const updatedExchange = await applyVerificationResults({ exchange, result })

    expect(updatedExchange.state).toBe('invalid')
    expect(updatedExchange.variables.results!.default.verified).toBe(false)
  })

  test('validates trusted issuers when specified', async function () {
    const exchange = createMockExchange({
      variables: {
        ...createMockExchange().variables,
        trustedIssuers: [
          'did:key:z6MkhVTX9BF3NGYX6cc7jWpbNnR7cAjH8LUffabZP8Qu4ysC'
        ]
      }
    })
    const result = createMockVerifierCoreResult(true, true)

    const updatedExchange = await applyVerificationResults({ exchange, result })

    expect(
      updatedExchange.variables.results!.default.issuerValidation
    ).toBeDefined()
    expect(
      updatedExchange.variables.results!.default.issuerValidation!
        .issuerFound
    ).toBe(true)
  })

  test('validates claims when specified', async function () {
    const exchange = createMockExchange({
      variables: {
        ...createMockExchange().variables,
        vprClaims: [
          {
            path: ['credentialSubject', 'achievement', 'id'],
            values: ['urn:uuid:test-achievement-id']
          }
        ]
      }
    })
    const result = createMockVerifierCoreResult(true, true)

    const updatedExchange = await applyVerificationResults({ exchange, result })

    expect(
      updatedExchange.variables.results!.default.claimsValidation
    ).toBeDefined()

    expect(
      updatedExchange.variables.results!.default.claimsValidation!.matched
    ).toBe(true)
    expect(
      updatedExchange.variables.results!.default.claimsValidation!
        .extractedClaims
    ).toHaveProperty('credentialSubject.achievement.id')
  })

  test('fails claims validation when values do not match', async function () {
    const exchange = createMockExchange({
      variables: {
        ...createMockExchange().variables,
        vprClaims: [
          {
            path: ['credentialSubject', 'achievement', 'id'],
            values: ['urn:uuid:different-achievement-id']
          }
        ]
      }
    })
    const result = createMockVerifierCoreResult(true, true)

    const updatedExchange = await applyVerificationResults({ exchange, result })

    expect(
      updatedExchange.variables.results!.default.claimsValidation
    ).toBeDefined()
    expect(
      updatedExchange.variables.results!.default.claimsValidation!.matched
    ).toBe(false)
    expect(
      updatedExchange.variables.results!.default.claimsValidation!
        .missingClaims
    ).toBeDefined()
  })

  test('handles multiple credentials and filters by claims', async function () {
    const credential1 = createMockCredential({
      credentialSubject: {
        achievement: { id: 'urn:uuid:achievement-1' }
      }
    })
    const credential2 = createMockCredential({
      credentialSubject: {
        achievement: { id: 'urn:uuid:achievement-2' }
      }
    })

    const exchange = createMockExchange({
      variables: {
        ...createMockExchange().variables,
        vprClaims: [
          {
            path: ['credentialSubject', 'achievement', 'id'],
            values: ['urn:uuid:achievement-1']
          }
        ]
      }
    })

    const result: import('@digitalcredentials/verifier-core').PresentationVerificationResult = {
      verified: true,
      presentationResults: [
        {
          id: 'cryptographic.proof.signature-valid',
          suite: 'proof',
          check: 'proof.signature-valid',
          outcome: { status: 'success', message: 'Valid' },
          fatal: true
        }
      ],
      credentialResults: [
        {
          verified: true,
          verifiableCredential: credential1,
          results: [
            { id: 'cryptographic.proof.signature-valid', suite: 'proof', check: 'proof.signature-valid', outcome: { status: 'success', message: 'Valid' } }
          ],
          summary: []
        },
        {
          verified: true,
          verifiableCredential: credential2,
          results: [
            { id: 'cryptographic.proof.signature-valid', suite: 'proof', check: 'proof.signature-valid', outcome: { status: 'success', message: 'Valid' } }
          ],
          summary: []
        }
      ],
      summary: [],
      verifiablePresentation: {} as any
    }

    const updatedExchange = await applyVerificationResults({ exchange, result })

    expect(
      updatedExchange.variables.results!.default.matchedCredentials
    ).toHaveLength(1)
    expect(
      updatedExchange.variables.results!.default.matchedCredentials[0]
        .credentialSubject.achievement.id
    ).toBe('urn:uuid:achievement-1')
  })
})

describe('participateInExchange - Empty Body Handling', function () {
  test('handles empty body (undefined) correctly for verify workflow', async function () {
    const exchange = createMockExchange()
    const workflow = getWorkflow('verify')

    const result = await participateInExchange({
      data: undefined,
      exchange,
      workflow,
      config: config.getConfig()
    })

    // Should return a VPR (Verifiable Presentation Request)
    expect(result).toHaveProperty('verifiablePresentationRequest')
    expect(result.verifiablePresentationRequest).toHaveProperty('query')
    expect(result.verifiablePresentationRequest).toHaveProperty('interact')
    expect(result.verifiablePresentationRequest.query[0].type).toBe(
      'QueryByExample'
    )
    expect(
      result.verifiablePresentationRequest.query.some(
        (q: { type: string }) => q.type === 'DIDAuthentication'
      )
    ).toBe(true)
  })

  test('handles empty object body ({}) correctly for verify workflow', async function () {
    const exchange = createMockExchange()
    const workflow = getWorkflow('verify')

    const result = await participateInExchange({
      data: {},
      exchange,
      workflow,
      config: config.getConfig()
    })

    // Should return a VPR (Verifiable Presentation Request)
    expect(result).toHaveProperty('verifiablePresentationRequest')
    expect(result.verifiablePresentationRequest).toHaveProperty('query')
    expect(result.verifiablePresentationRequest).toHaveProperty('interact')
    expect(result.verifiablePresentationRequest.query[0].type).toBe(
      'QueryByExample'
    )
    expect(
      result.verifiablePresentationRequest.query.some(
        (q: { type: string }) => q.type === 'DIDAuthentication'
      )
    ).toBe(true)
  })

  test('handles null body correctly for verify workflow', async function () {
    const exchange = createMockExchange()
    const workflow = getWorkflow('verify')

    const result = await participateInExchange({
      data: null,
      exchange,
      workflow,
      config: config.getConfig()
    })

    // Should return a VPR (Verifiable Presentation Request)
    expect(result).toHaveProperty('verifiablePresentationRequest')
    expect(result.verifiablePresentationRequest).toHaveProperty('query')
    expect(result.verifiablePresentationRequest).toHaveProperty('interact')
    expect(result.verifiablePresentationRequest.query[0].type).toBe(
      'QueryByExample'
    )
    expect(
      result.verifiablePresentationRequest.query.some(
        (q: { type: string }) => q.type === 'DIDAuthentication'
      )
    ).toBe(true)
  })
})

describe('LCW Protocol URL Generation', function () {
  test('generates correct LCW protocol URL format for verify workflow', function () {
    const serviceEndpoint =
      'https://verifierplus.org/workflows/verify/exchanges/ae2b438a-8471-4b00-82ec-a688d1857245'

    const lcwUrl = getWalletInteractionUrl('lcw', 'vcapi', serviceEndpoint)!

    expect(lcwUrl).toBe(
      `https://lcw.app/request.html?issuer=verifierplus.org&auth_type=bearer&vc_request_url=${encodeURIComponent(serviceEndpoint)}`
    )
  })

  test('generates correct VPR structure for verify workflow', function () {
    const exchange = createMockExchange({
      exchangeId: 'ae2b438a-8471-4b00-82ec-a688d1857245',
      variables: {
        ...createMockExchange().variables,
        exchangeHost: 'https://verifierplus.org',
        vprContext: ['https://www.w3.org/2018/credentials/v1'],
        vprCredentialType: ['VerifiableCredential']
      }
    })

    const vpr = getVerifyVPR(exchange)

    expect(vpr).toHaveProperty('query')
    expect(vpr).toHaveProperty('interact')
    expect(vpr).toHaveProperty('challenge')
    expect(vpr).toHaveProperty('domain')

    expect(vpr.query).toHaveLength(2)
    expect(vpr.query[0]).toEqual({
      type: 'QueryByExample',
      credentialQuery: expect.objectContaining({
        example: expect.any(Object)
      })
    })
    expect(vpr.query[1]).toEqual({
      type: 'DIDAuthentication',
      acceptedCryptosuites: [
        { cryptosuite: 'eddsa-rdfc-2022' },
        { cryptosuite: 'ecdsa-rdfc-2019' },
        { cryptosuite: 'ed25519-signature-2020' }
      ],
      acceptedMethods: [{ method: 'did:key' }, { method: 'did:web' }]
    })
    expect(vpr.acceptedCryptosuites).toEqual([
      { cryptosuite: 'eddsa-rdfc-2022' },
      { cryptosuite: 'ecdsa-rdfc-2019' },
      { cryptosuite: 'ed25519-signature-2020' }
    ])

    expect(vpr.challenge).toBe(exchange.variables.challenge)
    expect(vpr.domain).toBe(
      'https://verifierplus.org/workflows/verify/exchanges/ae2b438a-8471-4b00-82ec-a688d1857245'
    )

    expect(vpr.interact).toEqual({
      service: [
        {
          type: 'VerifiableCredentialApiExchangeService',
          serviceEndpoint:
            'https://verifierplus.org/workflows/verify/exchanges/ae2b438a-8471-4b00-82ec-a688d1857245'
        },
        {
          type: 'UnmediatedPresentationService2021',
          serviceEndpoint:
            'https://verifierplus.org/workflows/verify/exchanges/ae2b438a-8471-4b00-82ec-a688d1857245'
        }
      ]
    })
  })
})

const validProof = {
  type: 'Ed25519Signature2020',
  created: '2024-01-01T00:00:00Z',
  verificationMethod:
    'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK#z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
  proofPurpose: 'authentication',
  proofValue: 'zTestProofValue',
  challenge: 'test-challenge'
}

const validVCObject = {
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  issuer: 'did:key:z6MkissuerExample',
  issuanceDate: '2024-01-01T00:00:00Z',
  credentialSubject: { id: 'did:key:z6MkholderExample' }
}

describe('participateInVerifyExchange - VP validation', function () {
  const baseArgs = () => ({
    exchange: createMockExchange({ state: 'active' }),
    workflow: getWorkflow('verify'),
    config: config.getConfig()
  })

  test('rejects invalid VP structure with problemDetails', async function () {
    try {
      await participateInVerifyExchange({
        data: { invalid: 'not a VP' },
        ...baseArgs()
      })
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(HTTPException)
      const err = e as HTTPException
      expect(err.status).toBe(400)
      const cause = err.cause as ProblemDetailResponse
      expect(cause.message).toBe('Invalid Verifiable Presentation')
      expect(cause.problemDetails.length).toBeGreaterThan(0)
      expect(cause.problemDetails[0]).toHaveProperty('type')
      expect(cause.problemDetails[0]).toHaveProperty('detail')
    }
  })

  test('rejects VP missing holder with MALFORMED_VALUE_ERROR', async function () {
    const vpWithoutHolder = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: 'VerifiablePresentation',
      verifiableCredential: validVCObject,
      proof: validProof
    }

    try {
      await participateInVerifyExchange({
        data: vpWithoutHolder,
        ...baseArgs()
      })
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(HTTPException)
      const err = e as HTTPException
      expect(err.status).toBe(400)
      const cause = err.cause as ProblemDetailResponse
      expect(cause.message).toBe('holder is required for verification')
      expect(cause.problemDetails[0].title).toBe('MALFORMED_VALUE_ERROR')
    }
  })

  test('rejects VP with invalid credential and returns per-credential errors', async function () {
    const vpWithBadCredential = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: 'VerifiablePresentation',
      holder: 'did:key:z6MkholderExample',
      verifiableCredential: [
        { notACredential: true },
        validVCObject
      ],
      proof: validProof
    }

    try {
      await participateInVerifyExchange({
        data: vpWithBadCredential,
        ...baseArgs()
      })
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(HTTPException)
      const err = e as HTTPException
      expect(err.status).toBe(400)
      const cause = err.cause as ProblemDetailResponse
      expect(cause.message).toBe('Invalid Verifiable Credential(s)')
      expect(cause.problemDetails.length).toBeGreaterThan(0)
      expect(cause.problemDetails[0].detail).toContain('credential[0]')
    }
  })
})

describe('preparePresentationForVerify', function () {
  const baseConfig = () => config.getConfig()

  /**
   * Regression for the signature-breaking bug: verifier-core MUST receive
   * the raw, post-compatibility presentation object — not a Zod-normalized
   * derivative. JsonLdField widens single values into arrays
   * (`type: 'VerifiablePresentation'` → `['VerifiablePresentation']`),
   * which alters canonicalized n-quads and invalidates the proof.
   */
  test('preserves raw single-string `type` (signature regression)', function () {
    const presentation = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: 'VerifiablePresentation',
      holder: 'did:key:z6MkholderExample',
      verifiableCredential: validVCObject,
      proof: validProof
    }

    const out = preparePresentationForVerify({
      data: presentation,
      exchange: createMockExchange({ state: 'active' }),
      config: baseConfig()
    })

    expect(out.presentation.type).toBe('VerifiablePresentation')
    expect(Array.isArray(out.presentation.type)).toBe(false)
  })

  test('preserves raw single-object `verifiableCredential` (signature regression)', function () {
    const presentation = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: 'VerifiablePresentation',
      holder: 'did:key:z6MkholderExample',
      verifiableCredential: validVCObject,
      proof: validProof
    }

    const out = preparePresentationForVerify({
      data: presentation,
      exchange: createMockExchange({ state: 'active' }),
      config: baseConfig()
    })

    expect(out.presentation.verifiableCredential).toBe(validVCObject)
    expect(Array.isArray(out.presentation.verifiableCredential)).toBe(false)
  })

  test('accepts a bare VP body (no { verifiablePresentation } envelope)', function () {
    const bareVp = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: 'VerifiablePresentation',
      holder: 'did:key:z6MkholderExample',
      verifiableCredential: validVCObject,
      proof: validProof
    }

    const out = preparePresentationForVerify({
      data: bareVp,
      exchange: createMockExchange({ state: 'active' }),
      config: baseConfig()
    })

    expect(out.presentation.holder).toBe('did:key:z6MkholderExample')
    // wrap-bare-presentation should have fired; log records the wrap.
    const wrapEntry = out.compatLog.find(
      (e) => e.id === 'compat.vcalm-participation-message.wrap-bare-presentation'
    )
    expect(wrapEntry).toBeDefined()
    expect(wrapEntry!.outcome.status).toBe('success')
  })

  test('accepts a wrapped envelope and produces no compat-log entries', function () {
    const wrapped = {
      verifiablePresentation: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: 'VerifiablePresentation',
        holder: 'did:key:z6MkholderExample',
        verifiableCredential: validVCObject,
        proof: validProof
      }
    }

    const out = preparePresentationForVerify({
      data: wrapped,
      exchange: createMockExchange({ state: 'active' }),
      config: baseConfig()
    })

    expect(out.presentation.holder).toBe('did:key:z6MkholderExample')
    expect(out.compatLog).toEqual([])
  })

  test('debug resolves from variables.debug when set (true)', function () {
    const presentation = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: 'VerifiablePresentation',
      holder: 'did:key:z6MkholderExample',
      verifiableCredential: validVCObject,
      proof: validProof
    }
    const exchange = createMockExchange({
      state: 'active',
      variables: { ...createMockExchange().variables, debug: true }
    })

    const out = preparePresentationForVerify({
      data: presentation,
      exchange,
      config: baseConfig()
    })

    expect(out.debug).toBe(true)
  })

  test('debug resolves from variables.debug when set (false), overriding env default', function () {
    const presentation = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: 'VerifiablePresentation',
      holder: 'did:key:z6MkholderExample',
      verifiableCredential: validVCObject,
      proof: validProof
    }
    const exchange = createMockExchange({
      state: 'active',
      variables: { ...createMockExchange().variables, debug: false }
    })

    const out = preparePresentationForVerify({
      data: presentation,
      exchange,
      config: baseConfig()
    })

    expect(out.debug).toBe(false)
  })

  test('debug falls back to config.defaultExchangeDebug when variables.debug is unset', function () {
    const presentation = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: 'VerifiablePresentation',
      holder: 'did:key:z6MkholderExample',
      verifiableCredential: validVCObject,
      proof: validProof
    }

    const out = preparePresentationForVerify({
      data: presentation,
      exchange: createMockExchange({ state: 'active' }),
      config: { ...baseConfig(), defaultExchangeDebug: true }
    })

    expect(out.debug).toBe(true)
  })
})

describe('applyVerificationResults - debug + compatLog', function () {
  const compatEntry = (id: string): App.CheckResult => ({
    id: `compat.${id.replace(/:/g, '.')}`,
    outcome: { status: 'success', message: `applied ${id}` }
  })

  const singleProofResult = (): import('@digitalcredentials/verifier-core').PresentationVerificationResult => ({
    verified: true,
    verifiablePresentation: {} as any,
    presentationResults: [
      {
        id: 'cryptographic.proof.signature-valid',
        check: 'proof.signature-valid',
        suite: 'proof',
        outcome: { status: 'success', message: 'ok' }
      }
    ],
    credentialResults: [],
    summary: [
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
  })

  test('persists compatLog on result when debug=true', async function () {
    const exchange = createMockExchange()
    const result = singleProofResult()
    const compatLog = [compatEntry('vcalm-participation-message:wrap-bare-presentation')]

    const updated = await applyVerificationResults({
      exchange,
      result,
      compatLog,
      debug: true
    })

    const stored = updated.variables.results!.default
    expect(stored.compatLog).toBeDefined()
    expect(stored.compatLog).toHaveLength(1)
    expect(stored.compatLog![0].id).toBe(
      'compat.vcalm-participation-message.wrap-bare-presentation'
    )
    expect(stored.presentationResults[0].id).toBe(
      'cryptographic.proof.signature-valid'
    )
  })

  test('omits compatLog when debug=false', async function () {
    const exchange = createMockExchange()
    const result = singleProofResult()
    const compatLog = [compatEntry('vcalm-participation-message:wrap-bare-presentation')]

    const updated = await applyVerificationResults({
      exchange,
      result,
      compatLog,
      debug: false
    })

    expect(updated.variables.results!.default.compatLog).toBeUndefined()
  })

  test('compatLog and debug are optional (default: empty + false)', async function () {
    const exchange = createMockExchange()
    const result = createMockVerifierCoreResult(true, true)

    const updated = await applyVerificationResults({ exchange, result })

    expect(updated.variables.results!.default.compatLog).toBeUndefined()
    expect(updated.variables.results!.default.presentationResults).toEqual(
      result.presentationResults
    )
  })
})

// ---------------------------------------------------------------------------
// Async OB pass — sync/async branching + end-to-end worker drain
// ---------------------------------------------------------------------------

const OBV3_CONTEXT =
  'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'

/**
 * Inline minimal credentials for the async-pass tests. We keep them
 * separate from `createMockCredential` because that fixture's nested
 * `issuer` object includes a `name` field which `issuerObjectSchema`
 * (no `.passthrough()`) rejects in `parseCredential`. A bare string
 * issuer keeps structural validation happy without leaking those
 * details into every assertion.
 *
 * `obCredential` differs from `nonObCredential` only in the OBv3
 * context entry; both declare the `OpenBadgeCredential` type so the
 * recognizer's binary "context AND type" gate is the sole switch.
 */
const nonObCredential = (id = 'urn:uuid:non-ob-credential') => ({
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  id,
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  issuer: 'did:key:z6MkissuerExample',
  issuanceDate: '2024-01-01T00:00:00Z',
  credentialSubject: { id: 'did:key:z6MkholderExample' }
})

const obCredential = (id = 'urn:uuid:ob-credential-id') => ({
  '@context': ['https://www.w3.org/2018/credentials/v1', OBV3_CONTEXT],
  id,
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  issuer: 'did:key:z6MkissuerExample',
  issuanceDate: '2024-01-01T00:00:00Z',
  credentialSubject: { id: 'did:key:z6MkholderExample' }
})

/**
 * Minimal {@link CredentialVerificationResult} suitable for stuffing
 * into a fake `verifyPresentation` return — one passing proof check.
 */
const passingCredentialResult = (
  vc: unknown
): CredentialVerificationResult => ({
  verified: true,
  verifiableCredential: vc as CredentialVerificationResult['verifiableCredential'],
  results: [
    {
      id: 'cryptographic.proof.signature-valid',
      suite: 'proof',
      check: 'proof.signature-valid',
      outcome: { status: 'success', message: 'ok' }
    }
  ],
  summary: [
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
})

const fakeVerifier = (
  result: PresentationVerificationResult,
  credentialResultFor?: (
    vc: unknown
  ) => Promise<CredentialVerificationResult>
): Verifier => ({
  verifyPresentation: async () => result,
  verifyCredential: async ({ credential }) =>
    credentialResultFor
      ? credentialResultFor(credential)
      : passingCredentialResult(credential)
})

/**
 * Inline-friendly minimal VP body. We never sign it — the fake
 * verifier short-circuits cryptographic checks — but it must clear
 * `preparePresentationForVerify`'s structural validation. Holder is
 * supplied; verifiableCredential is provided per-test.
 */
const buildVpBody = (vc: unknown) => ({
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  type: 'VerifiablePresentation',
  holder: 'did:key:z6MkholderExample',
  verifiableCredential: vc,
  proof: {
    type: 'Ed25519Signature2020',
    created: '2024-01-01T00:00:00Z',
    verificationMethod:
      'did:key:z6MkholderExample#z6MkholderExample',
    proofPurpose: 'authentication',
    proofValue: 'zTestProofValue',
    challenge: 'test-challenge'
  }
})

const buildPresentationResult = (
  credentials: unknown[]
): PresentationVerificationResult => ({
  verified: true,
  verifiablePresentation: {} as never,
  presentationResults: [
    {
      id: 'cryptographic.proof.signature-valid',
      suite: 'proof',
      check: 'proof.signature-valid',
      outcome: { status: 'success', message: 'ok' }
    }
  ],
  summary: [
    {
      id: 'cryptographic.proof',
      phase: 'cryptographic',
      suite: 'proof',
      status: 'success',
      verified: true,
      message: '1 of 1 checks passed',
      counts: { passed: 1, failed: 0, skipped: 0 }
    }
  ],
  credentialResults: credentials.map(passingCredentialResult)
})

describe('identifyOpenBadgesCredentialIndices', () => {
  test('returns empty array when no credential is OB', () => {
    const result = buildPresentationResult([
      nonObCredential(),
      nonObCredential('urn:uuid:another')
    ])
    expect(
      identifyOpenBadgesCredentialIndices(result.credentialResults)
    ).toEqual([])
  })

  test('returns indices of OB credentials, skipping non-OB ones', () => {
    const result = buildPresentationResult([
      nonObCredential(),
      obCredential('urn:uuid:ob-1'),
      nonObCredential('urn:uuid:plain-2'),
      obCredential('urn:uuid:ob-3')
    ])
    expect(
      identifyOpenBadgesCredentialIndices(result.credentialResults)
    ).toEqual([1, 3])
  })
})

describe('participateInVerifyExchange — sync/async branching', function () {
  const baseArgs = () => ({
    exchange: createMockExchange({ state: 'active' }),
    workflow: getWorkflow('verify'),
    config: config.getConfig()
  })

  beforeEach(() => {
    clearKeyv()
    initializeTransactionManager()
    resetVerifyTaskQueueForTests()
    // Default to a no-op recording processor so the real worker
    // never runs against test data unless a test asks for it.
    setVerifyTaskProcessorForTests(async () => {})
  })

  afterEach(() => {
    resetVerifier(undefined)
    resetVerifyTaskQueueForTests()
    clearKeyv()
  })

  test('non-OB VP: finalizes inline, no verifyTask, queue empty', async () => {
    const vc = nonObCredential()
    resetVerifier(fakeVerifier(buildPresentationResult([vc])))
    const args = baseArgs()
    await saveExchange(args.exchange)

    await participateInVerifyExchange({ data: buildVpBody(vc), ...args })

    const stored = (await getExchangeData(
      args.exchange.exchangeId,
      'verify'
    )) as App.ExchangeDetailVerify
    expect(stored.state).toBe('complete')
    expect(stored.variables.verifyTask).toBeUndefined()
    expect(peekVerifyTaskQueueForTests()).toEqual([])
  })

  test('OB VP: state stays active, verifyTask queued, enqueued', async () => {
    const vc = obCredential()
    resetVerifier(fakeVerifier(buildPresentationResult([vc])))
    const args = baseArgs()
    await saveExchange(args.exchange)

    await participateInVerifyExchange({ data: buildVpBody(vc), ...args })

    const stored = (await getExchangeData(
      args.exchange.exchangeId,
      'verify'
    )) as App.ExchangeDetailVerify
    expect(stored.state).toBe('active')
    expect(stored.variables.verifyTask).toBeDefined()
    expect(stored.variables.verifyTask!.status).toBe('queued')
    expect(stored.variables.verifyTask!.openBadgesCredentialIndices).toEqual([0])
    expect(stored.variables.verifyTask!.attempt).toBe(1)
    expect(peekVerifyTaskQueueForTests()).toEqual([args.exchange.exchangeId])
  })

  test('mixed VP: only OB indices appear in the task', async () => {
    const ob = obCredential('urn:uuid:ob-mixed')
    const plain = nonObCredential('urn:uuid:plain-mixed')
    resetVerifier(fakeVerifier(buildPresentationResult([plain, ob])))
    const args = baseArgs()
    await saveExchange(args.exchange)

    await participateInVerifyExchange({
      data: buildVpBody([plain, ob]),
      ...args
    })

    const stored = (await getExchangeData(
      args.exchange.exchangeId,
      'verify'
    )) as App.ExchangeDetailVerify
    expect(stored.state).toBe('active')
    expect(stored.variables.verifyTask!.openBadgesCredentialIndices).toEqual([1])
  })

  test('forwards variables.options.{verbose,timing} to verifier-core', async () => {
    const vc = nonObCredential()
    const seen: Array<Record<string, unknown>> = []
    const recordingVerifier: Verifier = {
      verifyPresentation: async (call) => {
        seen.push(call as unknown as Record<string, unknown>)
        return buildPresentationResult([vc])
      },
      verifyCredential: async ({ credential }) =>
        passingCredentialResult(credential)
    }
    resetVerifier(recordingVerifier)
    const args = baseArgs()
    args.exchange.variables.options = { verbose: true, timing: true }
    await saveExchange(args.exchange)

    await participateInVerifyExchange({ data: buildVpBody(vc), ...args })

    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ verbose: true, timing: true })
  })

  test('omits verbose/timing keys when variables.options is unset', async () => {
    const vc = nonObCredential()
    const seen: Array<Record<string, unknown>> = []
    const recordingVerifier: Verifier = {
      verifyPresentation: async (call) => {
        seen.push(call as unknown as Record<string, unknown>)
        return buildPresentationResult([vc])
      },
      verifyCredential: async ({ credential }) =>
        passingCredentialResult(credential)
    }
    resetVerifier(recordingVerifier)
    const args = baseArgs()
    await saveExchange(args.exchange)

    await participateInVerifyExchange({ data: buildVpBody(vc), ...args })

    expect(seen).toHaveLength(1)
    expect('verbose' in seen[0]).toBe(false)
    expect('timing' in seen[0]).toBe(false)
  })

  test('persists summary, verifiablePresentation, and timing from result', async () => {
    const vc = nonObCredential()
    const presResult: PresentationVerificationResult = {
      ...buildPresentationResult([vc]),
      summary: [
        {
          id: 'cryptographic.proof',
          phase: 'cryptographic',
          suite: 'proof',
          status: 'success',
          verified: true,
          message: '1 of 1 checks passed',
          counts: { passed: 1, failed: 0, skipped: 0 }
        }
      ],
      verifiablePresentation: { foo: 'parsed-vp' } as never,
      timing: {
        startedAt: '2026-04-19T00:00:00.000Z',
        endedAt: '2026-04-19T00:00:00.005Z',
        durationMs: 5
      }
    }
    resetVerifier(fakeVerifier(presResult))
    const args = baseArgs()
    await saveExchange(args.exchange)

    await participateInVerifyExchange({ data: buildVpBody(vc), ...args })

    const stored = (await getExchangeData(
      args.exchange.exchangeId,
      'verify'
    )) as App.ExchangeDetailVerify
    const r = stored.variables.results!.default
    expect(r.summary).toEqual(presResult.summary)
    expect(r.verifiablePresentation).toEqual({ foo: 'parsed-vp' })
    expect(r.timing).toEqual(presResult.timing)
  })
})

describe('trusted-issuer registry-check filter', function () {
  /**
   * Phase 4 of `verifier-core-2-results-consumption` switched the
   * registry-check filter from the deprecated `r.suite === 'registry'`
   * test to `r.id?.startsWith('trust.registry.')`. These tests pin the
   * id-based behavior so a regression to the legacy field is caught.
   */
  test('registry checks are recognized via dotted id, not legacy suite key', async () => {
    const exchange = createMockExchange({
      variables: {
        ...createMockExchange().variables,
        trustedIssuers: ['did:key:zIssuerWithRegistryHit'],
        trustedRegistries: ['DCC Sandbox Registry']
      }
    })
    const result: PresentationVerificationResult = {
      verified: true,
      verifiablePresentation: {} as never,
      presentationResults: [],
      summary: [],
      credentialResults: [
        {
          verified: true,
          verifiableCredential: {
            issuer: 'did:key:zIssuerWithRegistryHit'
          } as never,
          summary: [
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
              id: 'trust.registry.issuer-registered',
              suite: 'registry',
              check: 'registry.issuer-registered',
              outcome: {
                status: 'success',
                message: 'Issuer found',
                payload: { foundInRegistries: ['DCC Sandbox Registry'] }
              } as never
            }
          ]
        }
      ]
    }

    const updated = await applyVerificationResults({ exchange, result })

    const iv = updated.variables.results!.default.issuerValidation!
    expect(iv.issuerFound).toBe(true)
  })
})

describe('participateInVerifyExchange — end-to-end worker drain', () => {
  const baseArgs = () => ({
    exchange: createMockExchange({ state: 'active' }),
    workflow: getWorkflow('verify'),
    config: config.getConfig()
  })

  beforeEach(() => {
    clearKeyv()
    initializeTransactionManager()
    resetVerifyTaskQueueForTests()
  })

  afterEach(() => {
    resetVerifier(undefined)
    resetVerifyTaskQueueForTests()
    clearKeyv()
  })

  test('OB pass merges and finalizes state to complete', async () => {
    const vc = obCredential('urn:uuid:e2e-ob')
    // Synthesize an OB-suite check that the worker will merge into
    // `credentialResults[0].results`. The `passingCredentialResult`
    // helper returns one proof check; we shadow it with an OB-suite
    // check so the merge is visibly attributable to the async pass.
    const obCheck: CheckResult = {
      id: 'semantic.openbadges.recognize',
      suite: 'openbadges',
      check: 'openbadges.recognize',
      outcome: { status: 'success', message: 'recognized' }
    }
    const obWorkerResult = (): CredentialVerificationResult => ({
      verified: true,
      verifiableCredential: vc as CredentialVerificationResult['verifiableCredential'],
      results: [obCheck],
      summary: [
        {
          id: 'semantic.openbadges',
          phase: 'semantic',
          suite: 'openbadges',
          status: 'success',
          verified: true,
          message: '1 of 1 checks passed',
          counts: { passed: 1, failed: 0, skipped: 0 }
        }
      ]
    })

    resetVerifier(
      fakeVerifier(buildPresentationResult([vc]), async () => obWorkerResult())
    )

    const args = baseArgs()
    await saveExchange(args.exchange)
    await participateInVerifyExchange({ data: buildVpBody(vc), ...args })

    // Drive the worker directly (rather than waiting on setImmediate).
    // The default deps wire to the real CAS save + the (now fake)
    // shared verifier, so this is end-to-end through the real merge.
    await processVerifyTask(args.exchange.exchangeId)

    const stored = (await getExchangeData(
      args.exchange.exchangeId,
      'verify'
    )) as App.ExchangeDetailVerify
    expect(stored.state).toBe('complete')
    expect(stored.variables.verifyTask!.status).toBe('succeeded')
    const credentialChecks =
      stored.variables.results!.default.credentialResults[0].results
    expect(
      credentialChecks.some((c) => c.id === 'semantic.openbadges.recognize')
    ).toBe(true)
  })
})

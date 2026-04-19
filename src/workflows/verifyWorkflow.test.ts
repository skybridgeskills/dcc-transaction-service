import * as config from '../config.js'
import { expect, test, describe } from 'vitest'
import type { CheckResult } from '@digitalcredentials/verifier-core'
import { getWorkflow } from '../workflows.js'
import {
  createExchangeVerify,
  validateExchangeVerify,
  applyVerificationResults,
  getVerifyVPR,
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
          suite: 'proof',
          check: 'proof.signature-valid',
          outcome: { status: 'success', message: 'Valid' },
          timestamp: new Date().toISOString(),
          fatal: true
        }
      ],
      credentialResults: [
        {
          verified: true,
          verifiableCredential: credential1,
          results: [
            { suite: 'proof', check: 'proof.signature-valid', outcome: { status: 'success', message: 'Valid' }, timestamp: new Date().toISOString() }
          ]
        },
        {
          verified: true,
          verifiableCredential: credential2,
          results: [
            { suite: 'proof', check: 'proof.signature-valid', outcome: { status: 'success', message: 'Valid' }, timestamp: new Date().toISOString() }
          ]
        }
      ],
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
      (e) => e.check === 'compatibility.vcalm-participation-message:wrap-bare-presentation'
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
  const compatEntry = (id: string): CheckResult => ({
    check: `compatibility.${id}`,
    suite: 'compatibility',
    outcome: { status: 'success', message: `applied ${id}` },
    timestamp: new Date().toISOString(),
    fatal: false
  })

  // Minimal verifier-core result with a single proof check on the
  // presentation and no credentials, so the derived allResults has
  // exactly one entry — making the compatLog merge assertions simple.
  const singleProofResult = (): import('@digitalcredentials/verifier-core').PresentationVerificationResult => ({
    verified: true,
    verifiablePresentation: {} as any,
    presentationResults: [
      {
        suite: 'proof',
        check: 'proof.signature-valid',
        outcome: { status: 'success', message: 'ok' },
        timestamp: new Date().toISOString()
      }
    ],
    credentialResults: []
  })

  test('prepends compatLog entries to allResults when debug=true', async function () {
    const exchange = createMockExchange()
    const result = singleProofResult()
    const compatLog = [compatEntry('vcalm-participation-message:wrap-bare-presentation')]

    const updated = await applyVerificationResults({
      exchange,
      result,
      compatLog,
      debug: true
    })

    const all = updated.variables.results!.default.allResults
    expect(all).toHaveLength(2)
    expect(all[0].suite).toBe('compatibility')
    expect(all[0].check).toBe(
      'compatibility.vcalm-participation-message:wrap-bare-presentation'
    )
    expect(all[1].suite).toBe('proof')
  })

  test('omits compatLog entries when debug=false', async function () {
    const exchange = createMockExchange()
    const result = singleProofResult()
    const compatLog = [compatEntry('vcalm-participation-message:wrap-bare-presentation')]

    const updated = await applyVerificationResults({
      exchange,
      result,
      compatLog,
      debug: false
    })

    const all = updated.variables.results!.default.allResults
    expect(all).toHaveLength(1)
    expect(all[0].suite).toBe('proof')
    expect(all.some((e) => e.suite === 'compatibility')).toBe(false)
  })

  test('compatLog and debug are optional (default: empty + false)', async function () {
    const exchange = createMockExchange()
    const result = createMockVerifierCoreResult(true, true)

    const updated = await applyVerificationResults({ exchange, result })

    const expected = [
      ...result.presentationResults,
      ...result.credentialResults.flatMap((cr) => cr.results)
    ]
    expect(updated.variables.results!.default.allResults).toEqual(expected)
  })
})

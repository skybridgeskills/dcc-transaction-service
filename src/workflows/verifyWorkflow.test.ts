import * as config from '../config.js'
import { expect, test, describe, beforeAll, afterAll, vi } from 'vitest'
import { getWorkflow } from '../workflows.js'
import {
  createExchangeVerify,
  validateExchangeVerify,
  applyVerificationResults,
  participateInVerifyExchange
} from './verifyWorkflow.js'
import {
  createMockExchange,
  createMockCredential,
  createMockPresentation,
  createMockVerifierCoreResult,
  createMockExpiredCredential,
  createMockRevokedCredential
} from '../test-fixtures/testData.js'

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
  })
})

describe('applyVerificationResults', function () {
  test('sets exchange state to complete for valid verification', async function () {
    const exchange = createMockExchange()
    const result = createMockVerifierCoreResult(true, true)

    const updatedExchange = await applyVerificationResults({ exchange, result })

    expect(updatedExchange.state).toBe('complete')
    expect(updatedExchange.variables.verificationResult).toBeDefined()
    expect(updatedExchange.variables.verificationResult!.overallOutcome).toBe(
      'complete'
    )
  })

  test('sets exchange state to invalid for invalid presentation signature', async function () {
    const exchange = createMockExchange()
    const result = createMockVerifierCoreResult(false, true)

    const updatedExchange = await applyVerificationResults({ exchange, result })

    expect(updatedExchange.state).toBe('invalid')
    expect(updatedExchange.variables.verificationResult!.overallOutcome).toBe(
      'invalid'
    )
  })

  test('sets exchange state to invalid for invalid credential signature', async function () {
    const exchange = createMockExchange()
    const result = createMockVerifierCoreResult(true, false)

    const updatedExchange = await applyVerificationResults({ exchange, result })

    expect(updatedExchange.state).toBe('invalid')
    expect(updatedExchange.variables.verificationResult!.overallOutcome).toBe(
      'invalid'
    )
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
      updatedExchange.variables.verificationResult!.issuerValidation
    ).toBeDefined()
    expect(
      updatedExchange.variables.verificationResult!.issuerValidation!
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
      updatedExchange.variables.verificationResult!.claimsValidation
    ).toBeDefined()

    expect(
      updatedExchange.variables.verificationResult!.claimsValidation!.matched
    ).toBe(true)
    expect(
      updatedExchange.variables.verificationResult!.claimsValidation!
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
      updatedExchange.variables.verificationResult!.claimsValidation
    ).toBeDefined()
    expect(
      updatedExchange.variables.verificationResult!.claimsValidation!.matched
    ).toBe(false)
    expect(
      updatedExchange.variables.verificationResult!.claimsValidation!
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

    const result = {
      presentationResult: { signature: 'VALID' },
      credentialResults: [
        {
          credential: credential1,
          log: [{ id: 'valid_signature', valid: true }]
        },
        {
          credential: credential2,
          log: [{ id: 'valid_signature', valid: true }]
        }
      ]
    }

    const updatedExchange = await applyVerificationResults({ exchange, result })

    expect(
      updatedExchange.variables.verificationResult!.matchedCredentials
    ).toHaveLength(1)
    expect(
      updatedExchange.variables.verificationResult!.matchedCredentials[0]
        .credentialSubject.achievement.id
    ).toBe('urn:uuid:achievement-1')
  })
})

// Note: Integration tests for participateInVerifyExchange would require more complex mocking
// For now, we'll focus on testing the core logic through applyVerificationResults
// which is the main business logic that can be tested in isolation

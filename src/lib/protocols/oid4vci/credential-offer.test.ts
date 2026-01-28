import { expect, test, describe } from 'vitest'
import { generateCredentialOffer } from './credential-offer.js'
import { createMockClaimExchange } from '../../../test-fixtures/testData.js'
import { getWorkflow } from '../../../workflows.js'
import { createFakeConfigService } from '../../../lib/services/fake-config-service.js'

describe('generateCredentialOffer', function () {
  const config = createFakeConfigService().getConfig()
  const workflow = getWorkflow('claim')

  test('generates valid credential offer structure', function () {
    const exchange = createMockClaimExchange({
      exchangeId: 'test-exchange-123',
      workflowId: 'claim',
      variables: {
        exchangeHost: 'http://localhost:4005',
        challenge: 'test-challenge',
        vc: JSON.stringify({
          '@context': ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential', 'TestCredential'],
          credentialSubject: { id: 'test' }
        })
      }
    })

    const offer = generateCredentialOffer(exchange, config, workflow)

    expect(offer).toBeDefined()
    expect(offer.credential_issuer).toBe('http://localhost:4005')
    expect(offer.credential_offer_uri).toBeDefined()
    expect(offer.credentials).toBeDefined()
    expect(Array.isArray(offer.credentials)).toBe(true)
    expect(offer.credentials.length).toBe(1)
    expect(offer.grants).toBeDefined()
    expect(
      offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']
    ).toBeDefined()
  })

  test('extracts credential types from VC template correctly', function () {
    const exchange = createMockClaimExchange({
      exchangeId: 'test-exchange-123',
      variables: {
        exchangeHost: 'http://localhost:4005',
        challenge: 'test-challenge',
        vc: JSON.stringify({
          '@context': ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential', 'OpenBadgeCredential', 'CustomType'],
          credentialSubject: { id: 'test' }
        })
      }
    })

    const offer = generateCredentialOffer(exchange, config, workflow)

    expect(offer.credentials[0].types).toEqual([
      'VerifiableCredential',
      'OpenBadgeCredential',
      'CustomType'
    ])
  })

  test('includes pre-authorized code in grants', function () {
    const exchange = createMockClaimExchange({
      exchangeId: 'test-exchange-123',
      variables: {
        exchangeHost: 'http://localhost:4005',
        challenge: 'test-challenge',
        vc: JSON.stringify({
          type: ['VerifiableCredential', 'TestCredential']
        })
      }
    })

    const offer = generateCredentialOffer(exchange, config, workflow)

    const preAuthGrant =
      offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']
    expect(preAuthGrant).toBeDefined()
    expect(preAuthGrant?.['pre-authorized_code']).toBeDefined()
    expect(typeof preAuthGrant?.['pre-authorized_code']).toBe('string')
    expect(preAuthGrant?.['pre-authorized_code'].length).toBeGreaterThan(0)
    expect(preAuthGrant?.user_pin_required).toBe(false)
  })

  test('generates correct credential_offer_uri', function () {
    const exchange = createMockClaimExchange({
      exchangeId: 'test-exchange-123',
      variables: {
        exchangeHost: 'http://localhost:4005',
        challenge: 'test-challenge',
        vc: JSON.stringify({
          type: ['VerifiableCredential']
        })
      }
    })

    const offer = generateCredentialOffer(exchange, config, workflow)

    expect(offer.credential_offer_uri).toBe(
      'http://localhost:4005/workflows/claim/exchanges/test-exchange-123/openid/credential-offer'
    )
  })

  test('handles invalid VC template gracefully', function () {
    const exchange = createMockClaimExchange({
      exchangeId: 'test-exchange-123',
      variables: {
        exchangeHost: 'http://localhost:4005',
        vc: 'invalid json'
      }
    })

    const offer = generateCredentialOffer(exchange, config, workflow)

    // Should still generate offer but with default types
    expect(offer).toBeDefined()
    expect(offer.credentials[0].types).toEqual(['VerifiableCredential'])
  })

  test('uses provided pre-authorized code if given', function () {
    const exchange = createMockClaimExchange({
      exchangeId: 'test-exchange-123',
      variables: {
        exchangeHost: 'http://localhost:4005',
        vc: JSON.stringify({
          type: ['VerifiableCredential']
        })
      }
    })

    const providedCode = 'test-pre-authorized-code-123'
    const offer = generateCredentialOffer(
      exchange,
      config,
      workflow,
      providedCode
    )

    const preAuthGrant =
      offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']
    expect(preAuthGrant['pre-authorized_code']).toBe(providedCode)
  })
})

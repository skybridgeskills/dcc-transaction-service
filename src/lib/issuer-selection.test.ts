import { describe, expect, test } from 'vitest'
import {
  extractWalletCryptosuitesFromPresentation,
  selectIssuerInstance
} from './issuer-selection.js'

describe('selectIssuerInstance', () => {
  test('prefers wallet-matching cryptosuite with newest-first among matches', () => {
    const tenant: App.Tenant = {
      tenantName: 't',
      tenantToken: 'x',
      issuerInstances: [
        { id: 'did:web:a', cryptosuite: 'ed25519-signature-2020', signingServiceTenant: 'legacy' },
        { id: 'did:web:b', cryptosuite: 'eddsa-rdfc-2022', signingServiceTenant: 'modern' }
      ]
    }
    const picked = selectIssuerInstance(tenant, ['ed25519-signature-2020', 'eddsa-rdfc-2022'])
    expect(picked?.signingServiceTenant).toBe('modern')
    expect(picked?.cryptosuite).toBe('eddsa-rdfc-2022')
  })

  test('falls back to priority when wallet hints do not match', () => {
    const tenant: App.Tenant = {
      tenantName: 't',
      tenantToken: 'x',
      issuerInstances: [
        { id: 'did:web:a', cryptosuite: 'ed25519-signature-2020', signingServiceTenant: 'legacy' },
        { id: 'did:web:b', cryptosuite: 'eddsa-rdfc-2022', signingServiceTenant: 'modern' }
      ]
    }
    const picked = selectIssuerInstance(tenant, ['some-unknown-suite'])
    expect(picked?.cryptosuite).toBe('eddsa-rdfc-2022')
  })

  test('returns null when no issuer instances', () => {
    const tenant: App.Tenant = {
      tenantName: 't',
      tenantToken: 'x'
    }
    expect(selectIssuerInstance(tenant, [])).toBeNull()
  })
})

describe('extractWalletCryptosuitesFromPresentation', () => {
  test('reads cryptosuite from Data Integrity proof', () => {
    const vp = {
      proof: { type: 'DataIntegrityProof', cryptosuite: 'eddsa-rdfc-2022' }
    }
    expect(extractWalletCryptosuitesFromPresentation(vp)).toEqual([
      'eddsa-rdfc-2022'
    ])
  })

  test('maps Ed25519Signature2020 type', () => {
    const vp = {
      proof: { type: 'Ed25519Signature2020' }
    }
    expect(extractWalletCryptosuitesFromPresentation(vp)).toEqual([
      'ed25519-signature-2020'
    ])
  })
})

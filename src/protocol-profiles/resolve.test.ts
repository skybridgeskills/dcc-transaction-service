/**
 * ⚠️ **Exactly one protocol profile is active per exchange, and two named
 * profiles are never merged.**
 *
 * The merge prohibition is the one worth guarding hardest. A merged result
 * still has a name — it just is not a name that describes the bytes, which
 * makes every citation of it wrong in a way nobody can see.
 */
import { describe, expect, test } from 'vitest'
import {
  buildProtocolProfileRegistry,
  resolveProtocolProfile,
  resolveProtocolProfileName
} from './index.js'
import { exampleProfile } from './example-profile.test-fixture.js'

const named = (name: string, delivery: 'by-value' | 'by-reference') => {
  const profile = exampleProfile({ name })
  profile.workflows.verify.oid4vp!.delivery = delivery
  return profile
}

const registry = buildProtocolProfileRegistry([
  named('example-1.0-from-exchange-redirect-uri', 'by-value'),
  named('example-1.0-from-tenant-redirect-uri', 'by-reference'),
  named('example-1.0-from-app-default-redirect-uri', 'by-reference')
])

const exchangeNaming = (protocolProfileName?: string) => ({
  variables: {
    challenge: 'chal',
    exchangeHost: 'https://verifier.example',
    ...(protocolProfileName ? { protocolProfileName } : {})
  }
})

describe('resolveProtocolProfileName', () => {
  test('the exchange beats the tenant, which beats the app default', () => {
    expect(
      resolveProtocolProfileName({
        exchange: exchangeNaming('example-1.0-from-exchange-redirect-uri'),
        tenant: { protocolProfileName: 'example-1.0-from-tenant-redirect-uri' },
        config: {
          defaultProtocolProfileName:
            'example-1.0-from-app-default-redirect-uri'
        }
      })
    ).toEqual({
      name: 'example-1.0-from-exchange-redirect-uri',
      source: 'exchange'
    })
  })

  test('a layer that names nothing is skipped, not treated as a value', () => {
    expect(
      resolveProtocolProfileName({
        exchange: exchangeNaming(),
        tenant: { protocolProfileName: 'example-1.0-from-tenant-redirect-uri' },
        config: {
          defaultProtocolProfileName:
            'example-1.0-from-app-default-redirect-uri'
        }
      })
    ).toEqual({
      name: 'example-1.0-from-tenant-redirect-uri',
      source: 'tenant'
    })
  })

  test('the app default is reached only when neither layer above names one', () => {
    expect(
      resolveProtocolProfileName({
        exchange: exchangeNaming(),
        tenant: {},
        config: {
          defaultProtocolProfileName:
            'example-1.0-from-app-default-redirect-uri'
        }
      })
    ).toEqual({
      name: 'example-1.0-from-app-default-redirect-uri',
      source: 'app-default'
    })
  })

  test('an empty name is not a name', () => {
    // An unset environment variable and one set to the empty string have to
    // behave identically, or an env file becomes a place where `''` is a
    // profile.
    expect(
      resolveProtocolProfileName({
        exchange: exchangeNaming(),
        tenant: { protocolProfileName: '' },
        config: {
          defaultProtocolProfileName:
            'example-1.0-from-app-default-redirect-uri'
        }
      }).source
    ).toBe('app-default')
  })

  test('naming nothing anywhere throws, naming all three places to set it', () => {
    // ⚠️ Not a fallback. A deployment that has not said which profile it
    // serves cannot have its bytes attributed to a name.
    expect(() =>
      resolveProtocolProfileName({
        exchange: exchangeNaming(),
        tenant: {},
        config: {}
      })
    ).toThrow(/protocolProfileName.*TENANT_PROFILE_<NAME>.*DEFAULT_PROTOCOL_PROFILE/s)
  })

  test('the winning layer is reported, so an election can be recorded', () => {
    // "The tenant default" and "the exchange asked for what the tenant default
    // happens to be" are different events; only one changes when the tenant
    // default changes.
    expect(
      resolveProtocolProfileName({
        exchange: exchangeNaming('example-1.0-from-tenant-redirect-uri'),
        tenant: { protocolProfileName: 'example-1.0-from-tenant-redirect-uri' },
        config: {}
      })
    ).toEqual({
      name: 'example-1.0-from-tenant-redirect-uri',
      source: 'exchange'
    })
  })
})

describe('resolveProtocolProfile', () => {
  test('the winner is returned whole — nothing from a losing layer survives', () => {
    // ⚠️ The merge prohibition, mechanised. The exchange profile delivers
    // by-value and both losing layers deliver by-reference; a merge in either
    // direction shows up here.
    const resolved = resolveProtocolProfile({
      exchange: exchangeNaming('example-1.0-from-exchange-redirect-uri'),
      tenant: { protocolProfileName: 'example-1.0-from-tenant-redirect-uri' },
      config: {
        defaultProtocolProfileName: 'example-1.0-from-app-default-redirect-uri'
      },
      registry
    })

    expect(resolved).toEqual(registry['example-1.0-from-exchange-redirect-uri'])
    expect(resolved.workflows.verify.oid4vp?.delivery).toBe('by-value')
  })

  test('a named profile that is not registered throws, and does not fall back', () => {
    // Quietly serving a different profile is how a run reports the wrong
    // answer about a wallet.
    expect(() =>
      resolveProtocolProfile({
        exchange: exchangeNaming('example-1.0-never-registered-redirect-uri'),
        config: {
          defaultProtocolProfileName:
            'example-1.0-from-app-default-redirect-uri'
        },
        registry
      })
    ).toThrow(/Unknown protocol profile "example-1.0-never-registered-redirect-uri"/)
  })
})

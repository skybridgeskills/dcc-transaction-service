/**
 * The entity identity, and the two ways a tenant can fail to have one.
 *
 * ⚠️ Both refusals exist to fire **at mint**. A `decentralized_identifier`
 * client_id is built while the interaction envelope is assembled, so a tenant
 * that cannot supply one fails before the exchange is handed over — never
 * mid-exchange, where a configuration fault would present to the operator as a
 * wallet refusal.
 */
import { describe, expect, test } from 'vitest'
import {
  EntityIdentityUnavailableError,
  entityIdentityForTenant
} from './entity-identity.js'

const configWith = (instances: App.IssuerInstance[] | undefined): App.Config =>
  ({
    tenants: {
      acme: {
        tenantName: 'acme',
        tenantToken: 't',
        ...(instances ? { issuerInstances: instances } : {})
      }
    }
  }) as unknown as App.Config

describe('the entity identity', () => {
  test('is the tenant’s first declared instance, with its signing tenant', () => {
    const identity = entityIdentityForTenant(
      'acme',
      configWith([
        {
          id: 'did:web:acme.test:ui:acme',
          cryptosuite: 'eddsa-rdfc-2022',
          signingServiceTenant: 'acmeseed'
        },
        {
          id: 'did:web:acme.test:ui:second',
          cryptosuite: 'ecdsa-rdfc-2019',
          signingServiceTenant: 'acmeseed2'
        }
      ])
    )
    // ⚠️ The FIRST instance. A tenant with several issuance lines has several
    // cryptosuites, not several identities — picking a line for a credential is
    // a different question from who the organisation is.
    expect(identity).toEqual({
      did: 'did:web:acme.test:ui:acme',
      signingServiceTenant: 'acmeseed'
    })
  })

  test('a tenant that declares none is refused, naming the env vars to set', () => {
    expect(() => entityIdentityForTenant('acme', configWith(undefined))).toThrow(
      EntityIdentityUnavailableError
    )
    try {
      entityIdentityForTenant('acme', configWith(undefined))
    } catch (error) {
      const err = error as EntityIdentityUnavailableError
      expect(err.refusal).toBe('no-entity-identity-configured')
      expect(err.message).toContain('TENANT_ISSUER_1_ID_ACME')
      // ⚠️ The env spelling says ISSUER and the value is not one. The message
      // says so, so nobody carries the misnomer into a verifier context.
      expect(err.message).toContain('ENTITY')
    }
  })

  test('⚠️ a did:key entity is refused — it publishes no document at a URL', () => {
    // The open decision M8 recorded: dcc-signing-service derives the JOSE `kid`
    // from the document it publishes at the identifier's own URL, and a did:key
    // has not got one. A deployment whose tenants are all did:key therefore
    // cannot serve the conformant arm at all, and nothing has decided what such
    // a deployment should do instead.
    try {
      entityIdentityForTenant(
        'acme',
        configWith([
          {
            id: 'did:key:z6MkjSomethingOrOther',
            cryptosuite: 'eddsa-rdfc-2022',
            signingServiceTenant: 'acmeseed'
          }
        ])
      )
      expect.unreachable('a did:key entity must be refused')
    } catch (error) {
      const err = error as EntityIdentityUnavailableError
      expect(err.refusal).toBe('entity-identity-is-not-did-web')
      expect(err.message).toContain('did:key:z6MkjSomethingOrOther')
      expect(err.message).toContain('There is no decision yet')
    }
  })
})

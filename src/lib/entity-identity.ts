/**
 * The DID a tenant signs as, and the signing-service tenant that holds its key.
 *
 * ## ⚠️ It is an ENTITY identity. It is not "the issuer DID".
 *
 * Some organisations function only as verifiers and some only as issuers. The
 * signing service signs on behalf of the entity, whatever role that entity is
 * playing at the time.
 *
 * One organisation, one identifier, whatever it is doing at the time. A
 * verifier-only organisation uses the same identifier unchanged, and a signed
 * OID4VP request object under the `decentralized_identifier` Client Identifier
 * Prefix is signed by the entity — not by "the issuer", which in a verification
 * flow is a different party altogether.
 *
 * ⚠️ **`TENANT_ISSUER_<n>_*` in `config.ts` is the misnomer, and it is load
 * bearing config that cannot be renamed without breaking every deployment's
 * `.env`.** This module is the boundary at which the wrong name stops: nothing
 * downstream of here says "issuer" about it. Do not propagate the env spelling
 * into a verifier context — that re-imports the role confusion the decision
 * removed.
 *
 * ## Why this reads `issuerInstances` and adds no config of its own
 *
 * The same argument `did-web-document.ts` makes about hosting: the tenant row
 * already carries both halves — the DID and the signing-service tenant whose
 * seed derives it — so a second place to write the identifier down would be a
 * second place for it to be written down *differently*. Gap H1 is this repo's
 * founding lesson and it was exactly that shape.
 *
 * ⚠️ **The first instance is the entity's identity.** A tenant with several
 * issuance lines has several *cryptosuites*, not several identities;
 * `selectIssuerInstance` picks a line for a credential, and that is a different
 * question from who the organisation is. If a deployment ever needs a second
 * identity it needs a second tenant, which is how a tenant and its ECDSA
 * counterpart are already configured.
 */
import { getConfig } from '../config.js'

/** Which identity, and whose seed derives its key. */
export interface EntityIdentity {
  /** The entity's DID — `did:web:<host>:<path…>`. */
  did: string
  /** Signing-service tenant that holds the seed, e.g. `example-tenant`. */
  signingServiceTenant: string
}

/** Why an entity identity could not be produced. A closed set, so the journal can group by it. */
export const ENTITY_IDENTITY_REFUSALS = [
  /** The tenant declares no identity at all. */
  'no-entity-identity-configured',
  /** The identity is not a `did:web:`, so no document is published at a URL. */
  'entity-identity-is-not-did-web'
] as const

export type EntityIdentityRefusal = (typeof ENTITY_IDENTITY_REFUSALS)[number]

/**
 * This tenant cannot act under its own DID.
 *
 * Loud rather than lenient, and thrown at MINT rather than at the wallet's
 * fetch: a `decentralized_identifier` client_id is built while the interaction
 * envelope is assembled, so a tenant that cannot supply one has to fail at
 * mint. Discovering it mid-exchange would present to the operator as a wallet
 * refusal — a fault of ours presenting as a product's failure, which this
 * service must never allow.
 */
export class EntityIdentityUnavailableError extends Error {
  constructor(
    readonly tenantName: string,
    readonly refusal: EntityIdentityRefusal,
    message: string
  ) {
    super(message)
    this.name = 'EntityIdentityUnavailableError'
  }
}

/**
 * The entity identity for a tenant.
 *
 * @throws {EntityIdentityUnavailableError} when the tenant declares none, or
 *   declares one the signing service cannot sign a request object under.
 */
export const entityIdentityForTenant = (
  tenantName: string,
  config: App.Config = getConfig()
): EntityIdentity => {
  const instance = config.tenants?.[tenantName]?.issuerInstances?.[0]
  if (!instance) {
    throw new EntityIdentityUnavailableError(
      tenantName,
      'no-entity-identity-configured',
      `Tenant '${tenantName}' declares no entity identity, so it cannot act under the ` +
        `\`decentralized_identifier\` client_id prefix. Set TENANT_ISSUER_1_ID_${tenantName.toUpperCase()} ` +
        `to the entity's DID and TENANT_ISSUER_1_SIGNING_TENANT_${tenantName.toUpperCase()} to the ` +
        `signing-service tenant holding its seed. ⚠️ The env spelling says "ISSUER"; the value is the ` +
        `ENTITY's identity and is used here in a verifier context.`
    )
  }
  if (!instance.id.startsWith('did:web:')) {
    // ⚠️ OUR rule, stated once, citing THEIRS.
    //
    // `dcc-signing-service`'s request-object endpoint reads the JOSE `kid` off
    // the document `getTenantDidDocument` publishes, and a `did:key` tenant
    // publishes no document at a URL — so that endpoint refuses it. We could
    // let the round trip discover that, and the refusal would be theirs and
    // correctly worded. We do not, because by then the QR is on the screen and
    // the exchange is live.
    //
    // ⚠️ **DELETE THIS CHECK if the signing service ever signs under a
    // non-`did:web` identity.** It exists only to move their refusal earlier,
    // not to hold an opinion of its own, and a check that outlives the
    // constraint it mirrors becomes a second statement about which identities
    // can sign — which is the thing this repo keeps paying for.
    throw new EntityIdentityUnavailableError(
      tenantName,
      'entity-identity-is-not-did-web',
      `Tenant '${tenantName}' has the entity identity '${instance.id}', which is not a \`did:web:\`. ` +
        `A signed request object needs a key the wallet can resolve from a published DID document, and ` +
        `dcc-signing-service derives the JOSE \`kid\` from the document it publishes at the identifier's ` +
        `own URL — which a did:key has not got. There is no decision yet about how a did:key-only ` +
        `deployment serves the conformant arm; it cannot serve it today.`
    )
  }
  return { did: instance.id, signingServiceTenant: instance.signingServiceTenant }
}

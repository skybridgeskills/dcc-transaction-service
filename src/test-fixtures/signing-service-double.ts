/**
 * A stand-in for `dcc-signing-service`'s request-object signing endpoint.
 *
 * ## ⚠️ What this double is FOR, and the line it does not cross
 *
 * It exists so this repo's tests can assert **what this service does with a
 * signed request object**, which is exactly one thing: send the claims and
 * serve the bytes that come back, verbatim. It asserts nothing about
 * cryptography, and it must never be read as evidence that anything is signed
 * correctly.
 *
 * ⚠️ **The real signature is tested where the real key is.**
 * `dcc-signing-service`'s own suite verifies its output against the LIVE
 * `did.json` response and proves a tampered payload does not verify. Repeating
 * that here would mean deriving a key from a seed in this repo — a second
 * signing implementation, on the wrong side of the boundary, and the exact
 * two-drivers drift `didWeb.js` exists to prevent.
 *
 * ## Why the fake signature is derived and not a constant
 *
 * The third segment is a digest of the signing input. That makes it a pure
 * function of the header and payload, exactly as a real signature is — so if
 * this service ever re-serializes, re-orders or re-encodes what the signing
 * service returned, the served third segment stops matching and a test fails.
 * A constant would let that defect through. ⚠️ It is **not** a signature and
 * verifying it proves nothing.
 */
import { createHash } from 'node:crypto'

/** The entity identity the double signs as. ⚠️ An ENTITY, not a role. */
export const DOUBLE_ENTITY_DID = 'did:web:example.test:ui:double-entity'

/** The signing-service tenant that would hold its seed. */
export const DOUBLE_SIGNING_TENANT = 'doubletenant'

/** Tenant name used by tests that need an entity identity. */
export const DOUBLE_TENANT_NAME = 'doubletenant'

/**
 * The verification method id the double reports — and therefore the JOSE `kid`
 * it puts in the header.
 *
 * ⚠️ **Read off the published document, never composed**, mirroring the real
 * endpoint's anti-drift move: it calls `getTenantDidDocument` and takes
 * `verificationMethod[0].id` rather than building `did + '#' + something`. A
 * double that composed it would pass while the real one drifted.
 */
export const doubleDidDocument = (): Record<string, unknown> => ({
  '@context': [
    'https://www.w3.org/ns/did/v1',
    'https://w3id.org/security/multikey/v1'
  ],
  id: DOUBLE_ENTITY_DID,
  verificationMethod: [
    {
      id: `${DOUBLE_ENTITY_DID}#z6MkDoubleEntityKeyForTestsOnly000000000000`,
      type: 'Multikey',
      controller: DOUBLE_ENTITY_DID,
      publicKeyMultibase: 'z6MkDoubleEntityKeyForTestsOnly000000000000'
    }
  ],
  authentication: [`${DOUBLE_ENTITY_DID}#z6MkDoubleEntityKeyForTestsOnly000000000000`]
})

export const doubleKid = (): string =>
  (doubleDidDocument().verificationMethod as Array<{ id: string }>)[0]!.id

const base64url = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')

/**
 * The compact JWS the double answers with: `alg: EdDSA`, the `typ` the media
 * type mirrors, and the `kid` from the published document.
 *
 * `alg` is EdDSA because the real endpoint has no choice — `did:web` cannot
 * express a P-256 verification method — and a double that offered a choice
 * would be modelling a capability nothing has.
 */
export const doubleSignRequestObject = (claims: unknown): string => {
  const signingInput = `${base64url({
    alg: 'EdDSA',
    typ: 'oauth-authz-req+jwt',
    kid: doubleKid()
  })}.${base64url(claims)}`
  const fakeSignature = createHash('sha256')
    .update(signingInput)
    .digest('base64url')
  return `${signingInput}.${fakeSignature}`
}

/** The tenant row a test needs for the entity identity to resolve. */
export const doubleTenant = (): App.Tenant => ({
  tenantName: DOUBLE_TENANT_NAME,
  tenantToken: 'double-tenant-token',
  // ⚠️ The env spelling says ISSUER; the value is the ENTITY's identity, and
  // this one is used purely in a verifier context. See `lib/entity-identity.ts`.
  issuerInstances: [
    {
      id: DOUBLE_ENTITY_DID,
      cryptosuite: 'eddsa-rdfc-2022',
      signingServiceTenant: DOUBLE_SIGNING_TENANT
    }
  ]
})

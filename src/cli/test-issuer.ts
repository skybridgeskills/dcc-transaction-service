/**
 * The issuer identity the CLI's test fixtures declare.
 *
 * ## Why this is derived and not written down
 *
 * A path-form `did:web` names a **host**, and the host that answers for our
 * fixtures is this service itself — the same deployment the CLI is already
 * pointed at. Writing the identifier into each fixture file therefore states
 * one deployment's tunnel hostname as though it were a property of the fixture,
 * which is how a set of test profiles ends up unusable anywhere but one
 * laptop. `docs/adr/2026-08-11-did-web-document-by-proxy.md` settles the same
 * question for the served document — *both halves are derived from
 * configuration that already exists* — and this is that rule applied to the
 * caller's side.
 *
 * ⚠️ **No new environment variable.** The authority comes from
 * `CLI_EXCHANGE_HOST`, which `cli.ts` already reads and forwards as
 * `variables.exchangeHost`, falling back to the same `http://localhost:4004`
 * default the CLI uses for `CLI_BASE_URL`. The path segment is fixture data,
 * exactly as the `did:key` issuer in `profiles/claim/ob3.ts` is.
 *
 * ## Which fixtures actually depend on the value
 *
 * ⚠️ Almost none. The signing service owns the issuer identity and
 * `addIssuerId` **overwrites** `issuer.id` from the tenant seed, so on every
 * normal claim path what a profile declares is read once and discarded (see
 * `src/workflows/claimWorkflow.ts`, and the control test in
 * `src/workflows/issuer-substitution.test.ts`). The one consumer of a declared
 * id is `tamper: 'issuer'`, which restores it *after* signing.
 *
 * That makes {@link SPOOF_ISSUER} the only identity here that has to be real:
 * the spoof fixture is worth running only while the DID it names **resolves**,
 * and the arm that names an unresolvable DID is a separate, weaker test. To
 * keep them distinct, configure an issuer instance whose id is exactly
 * {@link SPOOF_ISSUER.did} and whose signing tenant is NOT the one that signs
 * the fixture — this service then publishes its document at
 * {@link SPOOF_ISSUER.url}`did.json` by proxy, and nothing is hand-maintained.
 */

/** Same default as `CLI_BASE_URL` in `cli.ts`. */
const DEFAULT_EXCHANGE_HOST = 'http://localhost:4004'

const exchangeHost = (): string => {
  const configured = process.env.CLI_EXCHANGE_HOST
  if (!configured) return DEFAULT_EXCHANGE_HOST
  try {
    new URL(configured)
    return configured
  } catch {
    return DEFAULT_EXCHANGE_HOST
  }
}

/** One published issuer identity: the DID, and the URL its document hangs off. */
export interface TestIssuerIdentity {
  /** Path-form `did:web`, e.g. `did:web:localhost%3A4004:ui:test-issuer`. */
  did: string
  /** The same location as a URL, trailing slash included. */
  url: string
}

/**
 * Build a path-form `did:web` under `/ui/<pathSegment>/` on the exchange host.
 *
 * Per the did:web method, colon-separated segments after the authority become
 * path segments, and a port inside the authority is percent-encoded — so
 * `http://localhost:4004` yields `did:web:localhost%3A4004:ui:<segment>`.
 */
export const testIssuerIdentity = (pathSegment: string): TestIssuerIdentity => {
  const base = new URL(exchangeHost())
  return {
    did: `did:web:${encodeURIComponent(base.host)}:ui:${pathSegment}`,
    url: new URL(`/ui/${pathSegment}/`, base).toString()
  }
}

/**
 * The identity the test fixtures present as. Declared for the display
 * metadata that rides with it; the id itself is overwritten at signing.
 */
export const TEST_ISSUER = testIssuerIdentity('test-issuer')

/**
 * A second identity that is **not** the signer.
 *
 * ⚠️ Load-bearing, unlike {@link TEST_ISSUER}: `profiles/claim/issuer-spoof.ts`
 * restores this id after signing, and the fixture only tests what it claims to
 * while this DID resolves.
 */
export const SPOOF_ISSUER = testIssuerIdentity('spoof-issuer')

/** Neutral issuer display metadata shared by the test fixtures. */
export const TEST_ISSUER_NAME = 'Test Issuer'

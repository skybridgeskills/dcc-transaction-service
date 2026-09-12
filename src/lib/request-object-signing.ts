/**
 * Getting an OID4VP authorization request object signed, by the one component
 * that can honestly sign it.
 *
 * ## Why the signature is not produced here
 *
 * OID4VP §5.9.3's `decentralized_identifier` Client Identifier Prefix requires
 * the JOSE `kid` to name a key in the entity's published DID document. ⚠️
 * **`dcc-signing-service` is the only component that derives both the published
 * document and the signing key from one seed**, and it reads the `kid` off the
 * very document its `did.json` endpoint serves rather than composing one. A key
 * held here instead would be gap H1 across a service boundary: a published
 * document saying one thing, a configured seed producing another, and nothing
 * comparing them.
 *
 * This service therefore sends the claims and serves the bytes that come back,
 * ⚠️ **verbatim**. It does not parse them, re-serialize them, or rebuild the
 * header. A test asserts the served body is byte-identical to the response.
 *
 * ## ⚠️ The availability coupling, taken deliberately and at the worst moment
 *
 * `did-web-document.ts` already paid this price once, knowingly, for document
 * resolution. The `request_uri` response now takes the same dependency **while
 * a wallet is fetching, mid-exchange**.
 *
 * ⚠️ **A signing-service outage would otherwise present to the operator as a
 * wallet refusal** — a fault in this service wearing the costume of a result,
 * which is the failure this whole service exists to prevent. Three rules
 * follow, and
 * none of them is negotiable:
 *
 * 1. **Never a silent degrade.** There is no unsigned fallback on any path.
 *    `getProtocols` already enforces the same rule on the by-value `state`
 *    guard: *"a delivery that quietly becomes the other arm changes a second
 *    variable in a comparison meant to change one, and reports the wrong
 *    answer."* Serving the unsigned arm because signing failed would be that,
 *    plus a false claim of conformance.
 * 2. **A named, legible failure**, identifying the signing service as the
 *    cause, in the wallet-visible response (a 502, like the document proxy) and
 *    in the journal.
 * 3. ⚠️ **The upstream's own 4xx is NOT forwarded to the wallet.** A 400 from
 *    the signing service means *we* sent it something it could not sign; a 404
 *    means *our* tenant configuration is wrong. Telling a wallet its request
 *    was bad would be false and actively misleading — the same reasoning
 *    `upstream-call.ts` applies to 401/403 under `OUR_FAULT_STATUSES`, applied
 *    to the whole range because on this call every refusal is about us. The
 *    upstream's words still reach the journal verbatim, which is where a
 *    diagnosis belongs.
 */
import { callUpstreamService } from './upstream-call.js'
import type { AuthorizationRequest } from '../oid4vp/schemas.js'
import { entityIdentityForTenant } from './entity-identity.js'

/** Where the signing service signs a request object for a tenant. */
export const requestObjectSigningUrl = (
  config: App.Config,
  signingServiceTenant: string
): string =>
  `${config.signingService}/instance/${signingServiceTenant}/openid4vp/request-object/sign`

/**
 * The signing service could not produce a signed request object.
 *
 * Carries the URL that was tried and the upstream cause, for the same reason
 * {@link import('./did-web-document.js').DidWebDocumentUnavailableError} does:
 * whoever reads the 502 has to be able to tell a mis-set `SIGNING_SERVICE` from
 * a mis-set tenant seed without opening a debugger — mid-exchange, under time
 * pressure, with a wallet in hand.
 */
export class RequestObjectSigningUnavailableError extends Error {
  constructor(
    readonly signingServiceTenant: string,
    readonly url: string,
    readonly cause: unknown
  ) {
    super(
      `Could not sign the OID4VP request object for signing tenant ` +
        `'${signingServiceTenant}' at ${url}: ${describeCause(cause)}. ⚠️ The request was NOT ` +
        `served unsigned — this arm has no unsigned fallback, deliberately, because a delivery ` +
        `that quietly becomes the other arm reports the wrong answer. Check that ` +
        `dcc-signing-service is reachable at SIGNING_SERVICE and that its tenant ` +
        `'${signingServiceTenant}' is configured as a did:web issuer.`
    )
    this.name = 'RequestObjectSigningUnavailableError'
  }
}

const describeCause = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/** A compact JWS with three segments and a signature actually in the third. */
const isSignedCompactJws = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  const segments = value.split('.')
  return segments.length === 3 && segments.every((s) => s.length > 0)
}

/**
 * Sign `request` as a compact JWS, through `dcc-signing-service`.
 *
 * @returns the compact JWS exactly as the signing service produced it.
 * @throws {RequestObjectSigningUnavailableError} on any failure at all,
 *   including a 200 whose body is not a signed JWS.
 * @throws {import('./entity-identity.js').EntityIdentityUnavailableError} when
 *   the tenant has no entity identity to sign as. Not caught here: it is a
 *   configuration fault at mint, not an upstream outage, and the two must
 *   not arrive wearing one name.
 */
export const signRequestObject = async ({
  exchange,
  request,
  config
}: {
  exchange: App.ExchangeDetailVerify
  request: AuthorizationRequest
  config: App.Config
}): Promise<string> => {
  const { signingServiceTenant } = entityIdentityForTenant(
    exchange.tenantName,
    config
  )
  const url = requestObjectSigningUrl(config, signingServiceTenant)
  let signed: unknown
  try {
    signed = await callUpstreamService<unknown>({
      exchange,
      stage: 'request-object-signing',
      endpoint: url,
      // ⚠️ The claims go up exactly as this service built them. Choosing the
      // payload is the verifier's job; the signing service signs what it is
      // given and says so in its own docblock.
      body: request as unknown as Record<string, unknown>
    })
  } catch (error) {
    // ⚠️ Everything becomes ours. `callUpstreamService` has already journalled
    // the upstream status and body verbatim, and would otherwise re-throw a
    // forwardable 4xx straight at the wallet — see rule 3 above.
    throw new RequestObjectSigningUnavailableError(
      signingServiceTenant,
      url,
      error
    )
  }
  if (!isSignedCompactJws(signed)) {
    // ⚠️ A 200 is not a signature. An empty third segment is the `alg: none`
    // accommodation's shape, and the two arms must be impossible to confuse:
    // serving one while claiming the other is a false conformance claim on the
    // wire, which is worse than an outage because it looks like success.
    throw new RequestObjectSigningUnavailableError(
      signingServiceTenant,
      url,
      new Error(
        `the signing service answered without a signed compact JWS (got ${describeBody(signed)})`
      )
    )
  }
  return signed
}

const describeBody = (value: unknown): string => {
  if (typeof value !== 'string') return `a ${typeof value}`
  const segments = value.split('.')
  if (segments.length !== 3) return `${segments.length} JWS segment(s)`
  return 'three segments with an empty one among them'
}

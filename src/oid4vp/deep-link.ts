/**
 * Builders for the `openid4vp://` URL a wallet scans/clicks to start the
 * OID4VP 1.0 verification flow. Two deliveries, because the spec does not
 * permit one construction to cover both cases.
 *
 * **By value** ({@link buildOid4vpDeepLinkByValue}) — every authorization
 * request parameter inline in the URL. This is the ONLY conformant delivery
 * for a `redirect_uri` Client Identifier, and here is why:
 *
 *   - §5.9.3 — *"Requests using the `redirect_uri` Client Identifier Prefix
 *     cannot be signed because there is no method for the Wallet to obtain a
 *     trusted key for verification."* (draft 21 §5.7 says MUST NOT be signed.)
 *   - §5.10.1 — *"Request URI response MUST be an HTTP response with the
 *     content type `application/oauth-authz-req+jwt` and the body being a
 *     signed, optionally encrypted, request object"* — and for the GET case
 *     §5.1 delegates to RFC 9101, which requires a Request Object JWT too.
 *
 * Both MUSTs hold in every published version, so a `redirect_uri` client_id
 * **cannot be passed by reference at all**. ⚠️ **Read that as scoped to the
 * PREFIX, which is how §5.9.3 itself scopes it** — by-reference delivery is
 * conformant under a prefix that supplies a verification key, and this service
 * now serves such an arm. See the third bullet below.
 *
 * **By reference** ({@link buildOid4vpDeepLink}) — `client_id` plus a
 * `request_uri` the wallet GETs. What we answer with is a **profile decision**,
 * and the three answers make three different claims:
 *
 *   - **unsigned `application/json`** — the original arm. ⚠️ Undefined in every
 *     OID4VP version, per the above. Retained deliberately, NOT as a default
 *     worth defending: it is the baseline construction every other delivery is
 *     compared against. **Do not delete it to "clean up".**
 *   - **a genuinely signed request-object JWT** under the
 *     `decentralized_identifier` prefix — ⚠️ **the arm that IS conformant on
 *     this path**, and the reason the sentence below had to be re-read rather
 *     than merely re-stated. Signed by `dcc-signing-service`; see
 *     `lib/request-object-signing.ts`.
 *
 * ⚠️ **There is no third arm — an unsigned request-object JWT (`alg: none`) —
 * and there must not be one.** `request-object-jwt.ts` keeps the JAR lineage
 * that says why no published version permits it, so the next reader does not
 * re-derive it and propose the arm anyway.
 *
 * ⚠️ **The contradiction was never about by-reference delivery. It is a
 * property of the `redirect_uri` PREFIX**, and §5.9.3 says so itself when it
 * concludes that *"implementations requiring signed requests cannot use the
 * `redirect_uri` Client Identifier Prefix."* Change the prefix and by-reference
 * delivery is conformant — which is what the signed arm does. The JSON arm
 * stays non-conformant because it keeps the prefix, not because it is
 * fetched.
 *
 * ⚠️ **CONFORMANCE AND INTEROPERABILITY ARE DIFFERENT CLAIMS, and it is easy to
 * conflate them here.** *"A `redirect_uri` client_id cannot be passed by
 * reference at all"* is **correct about conformance under that prefix and wrong
 * about interoperability**: some clients resolve a JWT envelope and not the
 * JSON one. Both sentences are true at once, and that is why the two columns
 * are kept apart everywhere an arm is described.
 *
 * ⚠️ **And the conformant arm is not thereby the accepted one.** Its signature
 * is forced to EdDSA — the `did:web` driver cannot express a P-256 verification
 * method — where ES256 is the mDL/EUDI default. Conformant and accepted are
 * separate columns and this module asserts neither about any wallet.
 *
 * ⚠️ **Do not overcorrect in the other direction either.** `alg: none` does not
 * *"resolve the spec contradiction"*: the contradiction is real, and the prefix
 * is what resolves it.
 */
import type { AuthorizationRequest } from './schemas.js'

/**
 * Build an `openid4vp://?client_id=...&request_uri=...` deep link — the
 * BY-REFERENCE delivery. Small QR, undefined construction; see the module
 * docblock before reaching for this.
 */
export const buildOid4vpDeepLink = ({
  clientId,
  requestUri
}: {
  clientId: string
  requestUri: string
}): string =>
  `openid4vp://?client_id=${encodeURIComponent(
    clientId
  )}&request_uri=${encodeURIComponent(requestUri)}`

/**
 * Build an `openid4vp://?<every parameter>` deep link — the BY-VALUE
 * delivery, and the conformant one under the `redirect_uri` prefix.
 *
 * Object-valued parameters (`presentation_definition`, `dcql_query`,
 * `client_metadata`) are JSON-serialized, as OID4VP §5.1 specifies for
 * request parameters carried in a query string. `URLSearchParams` handles the
 * percent-encoding.
 *
 * ⚠️ **The payload is ~1.4 kB and it is scanned, not clicked.** A wallet need
 * not register a URL scheme at all, and for such a wallet the QR *is* the
 * delivery. `WalletInteraction.tsx` sizes the QR from the value length for
 * exactly this reason — a 200 px render of this string does not scan.
 *
 * ⚠️ **By value removes the `request_uri` GET, and with it the only wire
 * evidence a failed present produces.** For a wire-only wallet, a by-value
 * refusal leaves nothing on our side but the mint record — the wallet's own
 * screen is the only place the reason is legible.
 */
export const buildOid4vpDeepLinkByValue = (
  request: AuthorizationRequest
): string => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(request)) {
    if (value === undefined) continue
    params.set(key, typeof value === 'string' ? value : JSON.stringify(value))
  }
  return `openid4vp://?${params.toString()}`
}

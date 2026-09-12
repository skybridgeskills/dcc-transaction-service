/**
 * The media type OID4VP §5.10.1 names for a request-object response, and the
 * record of why this module serializes nothing.
 *
 * ## ⚠️ There is no unsigned request-object arm, and there must not be one
 *
 * The arm this module refuses to build is an **unsigned** request-object JWT —
 * `{"alg":"none","typ":"oauth-authz-req+jwt"}`, empty signature segment, under
 * a `jwt-unsigned` request-object format. The pull towards it is real: a
 * shipping verifier emits exactly that, and a client that resolves a JWT
 * envelope may not resolve raw `application/json`. **Interoperable and
 * conformant are different claims, and interoperability alone does not buy a
 * construction no published version permits.** See
 * `docs/adr/2026-08-25-oid4vp-request-object-envelopes.md` §2, which decides
 * that there is no unsigned arm and why.
 *
 * ⚠️ **The lineage is kept here because it is the part that keeps getting
 * re-derived**, and a reader who deletes this paragraph will spend the same
 * afternoon rediscovering it before proposing the arm again:
 *
 * - **OID4VP §5.10.1**, in 1.0-final and in draft 21 *verbatim*: the
 *   `request_uri` response body MUST be *"a **signed**, optionally encrypted,
 *   request object."* ⚠️ **No draft ever carved out `alg: none`.**
 * - **§5.9.3**: requests using the `redirect_uri` Client Identifier Prefix
 *   *"cannot be signed"*, and *"implementations requiring signed requests
 *   cannot use the `redirect_uri` Client Identifier Prefix."* ⚠️ **The spec's
 *   own resolution is "do not combine these two" — not "sign it with `none`."**
 * - `alg: none` is an **OIDC Core §6.1** legacy affordance — a request object
 *   *"MAY be signed or unsigned (plaintext) … indicated by use of the `none`
 *   algorithm"* — which **RFC 9101 (JAR) deliberately removed** (a Request
 *   Object *"MUST be one of: (a) JWS signed (b) JWS signed and JWE
 *   encrypted"*). **OID4VP inherits JAR.** A reader working from §5.10.1 alone
 *   reasonably concludes some draft must have permitted it.
 *
 * ⚠️ **And do not reach for a signing library to build one.** A JOSE library
 * that will emit an unsigned JWS is a library configured to *accept* one, and
 * that configuration does not stay confined to the call site that asked for it.
 * The shortcut is worse than the thing it would replace.
 *
 * A JWT served at `request_uri` by this service is therefore always a **signed**
 * one — `lib/request-object-signing.ts`, under the `decentralized_identifier`
 * prefix — so nothing downstream has to ask which kind it received.
 */

/** The media type OID4VP §5.10.1 names for a request-object response. */
export const REQUEST_OBJECT_JWT_MEDIA_TYPE = 'application/oauth-authz-req+jwt'

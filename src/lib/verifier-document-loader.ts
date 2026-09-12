/**
 * JSON-LD document loader for the verification stack, widened past
 * verifier-core's default.
 *
 * WHY THIS FILE EXISTS. verifier-core's default loader
 * (`defaultDocumentLoaderFor`) registers `did:key` and `did:web` only, and
 * registers each with the `z6Mk` (Ed25519) multikey header alone. Two live
 * wallets already observed on the wire bind their holder key as `did:jwk`,
 * and a P-256 issuer key — the shape every `ecdsa-*` suite uses — could not be
 * parsed off a resolved DID document at all. Both gaps rejected spec-correct
 * presentations, which this service's own rule forbids: a wallet must not be
 * recorded as failing because our instrument is wrong about a spec we claim to
 * speak.
 *
 * The loader is overridden here rather than in verifier-core because
 * `documentLoaderFromHttpGet` is not exported from that package. The one
 * capability lost by rebuilding locally is DID-document caching for
 * `did:web`: verifier-core wraps `DidWebDriver` so its fetches share the
 * caller's `HttpGetService`, and the stock driver used here reaches for
 * `@digitalcredentials/http-client` instead. JSON-LD contexts and status
 * lists still route through `httpGetService` via the protocol handler below,
 * so the regression is one uncached HTTPS GET per did:web issuer per
 * verification — a cost, not a correctness change.
 *
 * The principled home for `did:jwk` and P-256 is verifier-core itself; moving
 * them there would also close the `bitstring-status-check` gap noted in
 * `verifier.ts`. That is a follow-up in that repo, not this one.
 */
import { securityLoader } from '@digitalcredentials/security-document-loader'
import { CachedResolver } from '@digitalcredentials/did-io'
import * as didKey from '@digitalcredentials/did-method-key'
import { DidWebDriver } from '@digitalcredentials/did-method-web'
import * as didJwk from '@digitalbazaar/did-method-jwk'
import * as Ed25519Multikey from '@digitalcredentials/ed25519-multikey'
import * as EcdsaMultikey from '@digitalbazaar/ecdsa-multikey'
import type { HttpGetService } from '@digitalcredentials/verifier-core'

/**
 * Multibase prefixes registered on every DID driver that resolves keys out
 * of a DID document. `z6Mk` is Ed25519; `zDna` is P-256.
 *
 * WHERE `zDna` IS LOAD-BEARING — measured, because the obvious guess is
 * wrong. It is NOT needed for a P-256 key published in a did:web document:
 * there the driver returns the `Multikey` node as-is and the cryptosuite
 * decodes `publicKeyMultibase` itself, which is why the derived
 * `ecdsa-sd-2023` credential in `src/test-fixtures/` verifies without it. It IS needed for `did:key`, where the key
 * lives in the identifier and the driver must decode it to build the DID
 * document at all — without this line
 * `did:key:zDnaerDaTF5BXEavCrfRZEk316dpbLsfPDZ3WJ5hRTPFU2169` fails with
 * `Unsupported "multibaseMultikeyHeader", "zDna"`.
 *
 * That is not hypothetical: the VC Playground selective-disclosure fixture
 * used for selective disclosure is issued by a P-256 `did:key`. Drop this and
 * that fixture loses its issuer.
 */
const MULTIKEY_HEADERS = [
  { multibaseMultikeyHeader: 'z6Mk', fromMultibase: Ed25519Multikey.from },
  { multibaseMultikeyHeader: 'zDna', fromMultibase: EcdsaMultikey.from }
] as const

/**
 * Build the verification document loader over the given
 * {@link HttpGetService}, so remote contexts and status list credentials
 * share the service's Keyv-backed cache.
 */
export const buildVerifierDocumentLoader = (
  httpGetService: HttpGetService
): ReturnType<ReturnType<typeof securityLoader>['build']> => {
  const loader = securityLoader({ fetchRemoteContexts: true })

  const resolver = new CachedResolver()
  const didKeyDriver = didKey.driver()
  const didWebDriver = new DidWebDriver()
  resolver.use(didKeyDriver)
  resolver.use(didWebDriver)
  // did:jwk resolves LOCALLY — the DID is the base64url-encoded JWK, so this
  // driver makes no network call and cannot fail open on a fetch.
  resolver.use(didJwk.driver())
  for (const driver of [didKeyDriver, didWebDriver]) {
    for (const header of MULTIKEY_HEADERS) {
      driver.use({ ...header })
    }
  }
  loader.setDidResolver(resolver)

  // Routes http(s) documents through the caller's cache rather than a second,
  // unshared fetch stack.
  //
  // ⚠️ RETURNS THE DOCUMENT ITSELF, NOT A `{contextUrl, document, documentUrl}`
  // ENVELOPE. `JsonLdDocumentLoader.documentLoader` builds that envelope from
  // whatever a protocol handler returns (jsonld-document-loader
  // `lib/JsonLdDocumentLoader.js:68-79`), so returning one here wraps it twice
  // and hands every caller a wrapper where the document belonged.
  //
  // That is not theoretical: it made `slCredential.credentialSubject`
  // undefined in `@digitalcredentials/vc-bitstring-status-list`, and the raw
  // TypeError reached the user as `Status List Error` in the first
  // present-direction exchange ever run.
  //
  // Nothing caught it for months because JSON-LD contexts are served from
  // `securityLoader`'s BUNDLED static set, which is consulted BEFORE any
  // protocol handler — so contexts never took this path and every signature
  // check passed. Only remotely fetched documents reach here.
  const handler = {
    async get(params: Record<string, string>) {
      const url = params.url
      if (!url.startsWith('http')) {
        throw new Error('NotFoundError')
      }
      try {
        const { body, status } = await httpGetService.get(url)
        if (status < 200 || status >= 300) {
          throw new Error(`HTTP ${status}`)
        }
        return body
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(`NotFoundError loading "${url}": ${msg}`, { cause: e })
      }
    }
  }
  loader.setProtocolHandler({ protocol: 'http', handler })
  loader.setProtocolHandler({ protocol: 'https', handler })

  return loader.build()
}

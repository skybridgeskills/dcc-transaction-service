/**
 * ACCEPTANCE TEST for the status-list fetch defect.
 *
 * `JsonLdDocumentLoader.documentLoader` wraps whatever a protocol handler
 * returns:
 *
 *   document = await this.protocolHandlers.get(protocol).get({url})
 *   return { contextUrl: null, document, documentUrl: url }
 *
 * So a handler must return THE DOCUMENT ITSELF. Ours returned
 * `{contextUrl, document, documentUrl}`, which the loader then wrapped a
 * second time — handing every caller a wrapper where the document belonged.
 *
 * A presentation carrying a live status list surfaced:
 *   Status List Error — Cannot destructure property 'statusPurpose' of
 *   'slCredential.credentialSubject' as it is undefined.
 * `slCredential` was our wrapper, which has no `credentialSubject`.
 *
 * ⚠️ WHY NOTHING ELSE CAUGHT IT. JSON-LD contexts are served from
 * `securityLoader`'s BUNDLED static set, which `documentLoader` checks BEFORE
 * any protocol handler — so contexts never touched the broken path and every
 * signature check passed. Only documents fetched remotely reach the handler,
 * and in practice that is status lists. Hence a defect that survived
 * every green suite and only surfaced once a wallet presented a credential
 * carrying a live `BitstringStatusListEntry`.
 *
 * Hermetic: the stub throws on any URL it does not know, so this can never
 * silently start depending on the network.
 */
import { describe, test, expect } from 'vitest'
import { buildVerifierDocumentLoader } from './verifier-document-loader.js'

const SL_URL = 'https://issuer.example/statuses/list-1'

/** Shaped like the pilot's real status list, trimmed to what the check reads. */
const statusListCredential = {
  '@context': ['https://www.w3.org/ns/credentials/v2'],
  id: SL_URL,
  type: ['VerifiableCredential', 'BitstringStatusListCredential'],
  credentialSubject: {
    id: `${SL_URL}#list`,
    type: 'BitstringStatusList',
    statusPurpose: 'revocation',
    encodedList: 'uH4sIAAAAAAAAA-3BMQEAAADCoPVPbQwfoAAAAAAAAAAAAAAAAAAAAIC3AYbSVKsAQAAA'
  }
}

const httpGetService = {
  get: async (url: string) => {
    if (url !== SL_URL) throw new Error(`unexpected fetch: ${url}`)
    return { body: statusListCredential, status: 200, headers: new Headers() }
  }
} as never

describe('verifier document loader — remote documents are not double-wrapped', () => {
  test('a remotely fetched document IS the document', async () => {
    const loader = buildVerifierDocumentLoader(httpGetService)
    const result = await loader(SL_URL)

    // The defect's exact signature: a `document` whose own keys are the
    // loader envelope rather than the credential's.
    expect(Object.keys(result.document as object)).not.toContain('documentUrl')
    expect(result.document).toEqual(statusListCredential)
  })

  test('the status check can read `credentialSubject.statusPurpose`', async () => {
    // This is verbatim what @digitalcredentials/vc-bitstring-status-list does
    // at lib/index.js:204-215, and verbatim what threw in production.
    const loader = buildVerifierDocumentLoader(httpGetService)
    const { document: slCredential } = await loader(SL_URL)

    expect(() => {
      const { statusPurpose } = (slCredential as { credentialSubject: { statusPurpose: string } })
        .credentialSubject
      expect(statusPurpose).toBe('revocation')
    }).not.toThrow()
  })

  test('bundled contexts still resolve — the static path is untouched', async () => {
    // The regression guard that matters: contexts come from the BUNDLED set,
    // never the protocol handler, which is why they masked this defect. The
    // stub above throws on any fetch, so reaching the network fails the test.
    const loader = buildVerifierDocumentLoader(httpGetService)
    const result = await loader('https://www.w3.org/ns/credentials/v2')
    expect((result.document as { '@context': unknown })['@context']).toBeDefined()
  })
})

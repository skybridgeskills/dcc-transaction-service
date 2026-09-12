import { describe, expect, test } from 'vitest'
import { qrMismatch, qrSizeFor } from './WalletInteraction.js'
import { buildOid4vpDeepLinkByValue } from '../oid4vp/deep-link.js'
import { buildAuthorizationRequest } from '../oid4vp/authorization-request.js'
import { ensureOid4vpState } from '../oid4vp/state.js'

/*
The QR is not a convenience here — it is the delivery. At least one shipping
wallet registers no URL scheme at all, so a by-value OID4VP request reaches
that wallet as pixels on a laptop screen or not at all. A fixed 200 px render
of a ~1.4 kB payload is roughly 1.5 device pixels per module and does not
scan, and a failure that only shows up with a device in hand is the most
expensive kind to find.
*/
describe('qrSizeFor', () => {
  test('leaves short payloads at the size every candidate already renders', () => {
    expect(qrSizeFor('openid4vp://?client_id=x&request_uri=y')).toBe(200)
    expect(qrSizeFor('a'.repeat(400))).toBe(200)
  })

  test('grows for mid-length payloads', () => {
    expect(qrSizeFor('a'.repeat(401))).toBe(320)
    expect(qrSizeFor('a'.repeat(900))).toBe(320)
  })

  test('reaches its largest render for by-value OID4VP payloads', () => {
    expect(qrSizeFor('a'.repeat(901))).toBe(440)
  })

  test('a real by-value PEX request lands in the largest bucket', () => {
    const exchange = ensureOid4vpState({
      tenantName: 'default',
      workflowId: 'verify',
      exchangeId: 'exch-qr',
      expires: new Date(Date.now() + 60_000).toISOString(),
      state: 'pending',
      variables: {
        challenge: 'chal-qr',
        exchangeHost: 'https://verifier.example',
        vprContext: ['https://www.w3.org/2018/credentials/v1'],
        vprCredentialType: ['VerifiableCredential', 'OpenBadgeCredential'],
        trustedIssuers: [],
        trustedRegistries: [],
        vprClaims: [],
        oid4vpQueryLanguage: 'pex'
      }
    }).exchange
    const link = buildOid4vpDeepLinkByValue(buildAuthorizationRequest(exchange))
    expect(qrSizeFor(link)).toBe(440)
  })

  test('the by-reference link stays at 200 px — the baseline is unchanged', () => {
    expect(
      qrSizeFor(
        'openid4vp://?client_id=redirect_uri%3Ahttps%3A%2F%2Fverifier.example%2Fworkflows%2Fverify%2Fexchanges%2Fexch-123%2Fopenid4vp%2Fresponse&request_uri=https%3A%2F%2Fverifier.example%2Fworkflows%2Fverify%2Fexchanges%2Fexch-123%2Fopenid4vp%2Frequest'
      )
    ).toBe(200)
  })
})


/*
The selection and the payload were two different facts, and the runs that
went wrong went wrong on the gap between them. ⚠️ **`resolvePayload` is gone, and
the gap with it**: the payload is built by the server and carried on the preset,
so the string the page DISPLAYS and the string it REPORTS are the same object.
There is no second derivation left to disagree.

What survives is the case a single source cannot cover: the QR drifting out of
step with the row that is highlighted.
*/
describe('qrMismatch', () => {
  const preset = (
    over: Partial<{
      isDefault: boolean
      protocolProfileName: string | null
      payload: string
    }> = {}
  ) => ({
    id: 'iu',
    payloadId: 'iu',
    protocolProfileName: null as string | null,
    isDefault: true,
    axes: [],
    productIds: [],
    payload: 'https://verifier.example/interactions/exch-1?iuv=1',
    ...over
  })

  test('the active construction with an unpinned payload agrees', () => {
    const p = preset()
    expect(qrMismatch(p.payload, p)).toBe(false)
  })

  test('a pinned payload under a preset that names the same profile agrees', () => {
    const p = preset({
      isDefault: false,
      protocolProfileName: 'profile-x',
      payload:
        'https://verifier.example/interactions/exch-1?iuv=1&protocolProfile=profile-x'
    })
    expect(qrMismatch(p.payload, p)).toBe(false)
  })

  test('a WRONG pin is a mismatch', () => {
    const p = preset({
      isDefault: false,
      protocolProfileName: 'profile-x',
      payload:
        'https://verifier.example/interactions/exch-1?iuv=1&protocolProfile=profile-y'
    })
    expect(qrMismatch(p.payload, p)).toBe(true)
  })

  test('⚠️ a DROPPED pin is a mismatch — the case the naive check misses', () => {
    // The silent lie this design exists to prevent: the QR quietly serves the
    // active construction while a test case believes it pinned something else.
    // Nothing on the wire would say so, because an unpinned payload is
    // byte-identical to the active construction by construction.
    const p = preset({
      isDefault: false,
      protocolProfileName: 'profile-x',
      payload: 'https://verifier.example/interactions/exch-1?iuv=1'
    })
    expect(qrMismatch(p.payload, p)).toBe(true)
  })

  test('⚠️ an unexpected pin on the ACTIVE row is a mismatch too', () => {
    const p = preset({
      payload:
        'https://verifier.example/interactions/exch-1?iuv=1&protocolProfile=profile-x'
    })
    expect(qrMismatch(p.payload, p)).toBe(true)
  })

  test('⚠️ a null profile name on the active row does not fire the refusal', () => {
    // `protocolProfileName` is null whenever no layer names a profile — the
    // state every deployment is in until DEFAULT_PROTOCOL_PROFILE is set. Keyed
    // on a name comparison, this would fire on every page load.
    const p = preset({ protocolProfileName: null })
    expect(qrMismatch(p.payload, p)).toBe(false)
  })
})

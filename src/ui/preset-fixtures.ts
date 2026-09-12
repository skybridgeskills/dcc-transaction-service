/**
 * Preset fixtures for the UI tests and stories.
 *
 * ⚠️ **Shaped exactly as `GET /interactions/:id/presets` serves them**, because
 * the page's whole contract is that it renders what the server says is offerable
 * and builds no payload of its own. A fixture that invented a field the server
 * does not send would be testing a page that cannot exist.
 */
import type { LaunchPreset } from '../lib/services/exchange-client/exchange-client.js'

const HOST = 'https://verifier.example'
const IU = `${HOST}/interactions/exch-1?iuv=1`
const REQUEST_URI = `${HOST}/workflows/verify/exchanges/exch-1/openid4vp/request`
const CLIENT_ID = `redirect_uri:${HOST}/workflows/verify/exchanges/exch-1/openid4vp/response`

const deepLink = (pin?: string): string =>
  `openid4vp://?client_id=${encodeURIComponent(CLIENT_ID)}&request_uri=${encodeURIComponent(
    pin ? `${REQUEST_URI}?protocolProfile=${encodeURIComponent(pin)}` : REQUEST_URI
  )}`

const iu = (pin?: string): string =>
  pin ? `${IU}&protocolProfile=${encodeURIComponent(pin)}` : IU

export const DEFAULT_PROFILE = 'oid4vp-1.0-json-by-reference-dcql-redirect-uri'
export const VPR_PROFILE = 'vcapi-vpr-bare-origin-domain'
/**
 * ⚠️ The **signed** request-object arm — the only JWT envelope this service
 * serves. ⚠️ Keep this fixture on a profile the registry actually holds: one
 * naming a profile it does not would let the page render a row no deployment
 * can offer.
 */
export const JWT_PROFILE =
  'oid4vp-1.0-jwt-signed-by-reference-dcql-decentralized-identifier'

const preset = (over: Partial<LaunchPreset> & Pick<LaunchPreset, 'id' | 'payloadId' | 'payload'>): LaunchPreset => ({
  protocolProfileName: DEFAULT_PROFILE,
  isDefault: true,
  axes: [],
  productIds: [],
  ...over
})

/** The set a shipped exchange offers today: 4 on `iu`, 3 on `OID4VP`, 1 each. */
export const PRESETS: LaunchPreset[] = [
  preset({ id: 'iu', payloadId: 'iu', payload: iu() }),
  preset({
    id: `iu:${VPR_PROFILE}`,
    payloadId: 'iu',
    payload: iu(VPR_PROFILE),
    protocolProfileName: VPR_PROFILE,
    isDefault: false,
    axes: [{ field: 'domainForm', value: 'exchange-host' }]
  }),
  preset({
    id: `iu:${JWT_PROFILE}`,
    payloadId: 'iu',
    payload: iu(JWT_PROFILE),
    protocolProfileName: JWT_PROFILE,
    isDefault: false,
    axes: [
      { field: 'clientIdPrefix', value: 'decentralized-identifier' },
      { field: 'requestObjectFormat', value: 'jwt-signed' }
    ]
  }),
  preset({ id: 'vcapi', payloadId: 'vcapi', payload: `${HOST}/workflows/verify/exchanges/exch-1` }),
  preset({ id: 'lcw', payloadId: 'lcw', payload: 'https://lcw.app/request?vc_request_url=x' }),
  preset({ id: 'OID4VP', payloadId: 'OID4VP', payload: deepLink() }),
  preset({
    id: `OID4VP:${JWT_PROFILE}`,
    payloadId: 'OID4VP',
    payload: deepLink(JWT_PROFILE),
    protocolProfileName: JWT_PROFILE,
    isDefault: false,
    axes: [
      { field: 'clientIdPrefix', value: 'decentralized-identifier' },
      { field: 'requestObjectFormat', value: 'jwt-signed' }
    ]
  }),
  preset({ id: 'asu-pocket', payloadId: 'asu-pocket', payload: 'asuprequest://request?vc_request_url=x' }),
  preset({ id: 'my-skills-pocket', payloadId: 'my-skills-pocket', payload: 'msprequest://request?vc_request_url=x' }),
  preset({ id: 'learncard', payloadId: 'learncard', payload: 'https://learncard.app/request?vc_request_url=x' })
]

/** ⚠️ A preset whose payload has LOST its pin — the QR/preset mismatch. */
export const DROPPED_PIN: LaunchPreset = preset({
  id: `iu:${VPR_PROFILE}`,
  payloadId: 'iu',
  payload: iu(),
  protocolProfileName: VPR_PROFILE,
  isDefault: false,
  axes: [{ field: 'domainForm', value: 'exchange-host' }]
})

/** The envelope the page fetches beside the presets. */
export const PROTOCOLS: Record<string, string> = {
  iu: IU,
  vcapi: `${HOST}/workflows/verify/exchanges/exch-1`,
  OID4VP: deepLink(),
  // ⚠️ The deprecated and versioned spellings both go out, byte-identical.
  'oid4vp-1.0': deepLink()
}

/** Many operator rows, for the bounded-list story. */
export const MANY_PRESETS: LaunchPreset[] = [
  ...PRESETS,
  ...Array.from({ length: 16 }, (_, i) =>
    preset({
      id: `iu:fixture-profile-${i}`,
      payloadId: 'iu',
      payload: iu(`fixture-profile-${i}`),
      protocolProfileName: `fixture-profile-${i}`,
      isDefault: false,
      axes: [{ field: 'somethingNew', value: `value-${i}` }]
    })
  )
]

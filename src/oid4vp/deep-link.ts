/**
 * Builder for the `openid4vp://` URL scheme a wallet scans/clicks to
 * start the OID4VP 1.0 verification flow.
 *
 * Delivered "by reference" — the deep link carries `client_id` plus a
 * `request_uri` the wallet GETs for the full authorization request — to
 * keep the QR payload small (§5.7 RECOMMENDED with `direct_post`).
 */

/** Build an `openid4vp://?client_id=...&request_uri=...` deep link. */
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

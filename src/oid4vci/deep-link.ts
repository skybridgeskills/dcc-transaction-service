/**
 * Builders for the `openid-credential-offer://` URL scheme used to
 * invoke a native wallet from a QR code or a same-device link.
 *
 * Spec: OID4VCI 1.0 §4.1.2 / §4.1.3.
 */

/** Build a deep link that references the Credential Offer by URI. */
export const buildOpenIdCredentialOfferDeepLinkByReference = (
  credentialOfferUri: string
): string =>
  `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(
    credentialOfferUri
  )}`

/**
 * Build a deep link that embeds the Credential Offer directly.
 * Currently unused by the service but exposed for tests + future use.
 */
export const buildOpenIdCredentialOfferDeepLinkByValue = (
  credentialOffer: object
): string =>
  `openid-credential-offer://?credential_offer=${encodeURIComponent(
    JSON.stringify(credentialOffer)
  )}`

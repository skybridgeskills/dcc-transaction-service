/**
 * The URL *shapes* a wallet product accepts, named for the shape and never for
 * the product.
 *
 * ## Why this file exists at all
 *
 * The wallet modules beside it used to be vendor-named **and** carry the URL
 * construction — one object holding both "who this product is" and "what bytes
 * we build for it". That coupling is the thing this surface exists to break:
 *
 * - A construction-named thing stays true; a vendor-named one becomes a lie on
 *   that vendor's next release.
 * - ⚠️ **Multiple products share one construction, and that overlap IS the
 *   product goal.** Three of the four products below build the *same* URL shape
 *   and differ only in where it points. With a builder per vendor module, that
 *   fact was invisible — three functions, three files, one shape nobody could
 *   see. It is the first thing you notice here.
 * - A table naming vendors is the part that SHOULD go stale: cheap to fix,
 *   obviously wrong when wrong, and safe to take a community PR against —
 *   because changing it cannot change what the service emits.
 *
 * ## The split
 *
 * **Shape lives here. Where it points lives with the product.** A product entry
 * carries its own `linkBase` — a vendor's own address is product identity in the
 * most literal sense — and names which shapes it accepts. Nothing here branches
 * on a product, and no function below knows a vendor exists.
 */

/** The parameters every construction may draw on. */
export interface WalletLinkInputs {
  /** The VC-API exchange service endpoint. */
  serviceEndpoint: string
  /** The exchange challenge, where the shape carries one. */
  challenge?: string
}

/**
 * The shapes this service knows how to build.
 *
 * `none` states that no wallet-convenience link is offered — a value, not an
 * omission.
 */
export const WALLET_LINK_CONSTRUCTIONS = [
  'none',
  'vc-request-url-query',
  'issuer-auth-challenge-query',
  'protocols-json-query'
] as const
export type WalletLinkConstruction =
  (typeof WALLET_LINK_CONSTRUCTIONS)[number]

/**
 * `<base>?vc_request_url=<encoded service endpoint>`
 *
 * ⚠️ **Three products share this shape** and differ only in `linkBase` — two
 * custom schemes and one https host. That is exactly the overlap a
 * vendor-per-module layout hid.
 */
const vcRequestUrlQuery = (base: string, { serviceEndpoint }: WalletLinkInputs) =>
  `${base}?vc_request_url=${encodeURIComponent(serviceEndpoint)}`

/**
 * `<base>?issuer=<host>&auth_type=bearer[&challenge=…]&vc_request_url=<encoded>`
 *
 * ⚠️ **Parameter order is a wire fact here, not a style choice.** These bytes
 * are cited by recorded runs, so `challenge` sits between `auth_type` and
 * `vc_request_url` exactly where it has always sat, and is omitted rather than
 * emitted empty when there is none.
 */
const issuerAuthChallengeQuery = (
  base: string,
  { serviceEndpoint, challenge }: WalletLinkInputs
) => {
  const issuer = new URL(serviceEndpoint).hostname
  const challengeParam = challenge ? `&challenge=${challenge}` : ''
  return `${base}?issuer=${issuer}&auth_type=bearer${challengeParam}&vc_request_url=${encodeURIComponent(
    serviceEndpoint
  )}`
}

/** `<base>?request=<encoded {"protocols":{"vcapi":…}}>` */
const protocolsJsonQuery = (
  base: string,
  { serviceEndpoint }: WalletLinkInputs
) =>
  `${base}?request=${encodeURIComponent(
    JSON.stringify({ protocols: { vcapi: serviceEndpoint } })
  )}`

const BUILDERS: Record<
  Exclude<WalletLinkConstruction, 'none'>,
  (base: string, inputs: WalletLinkInputs) => string
> = {
  'vc-request-url-query': vcRequestUrlQuery,
  'issuer-auth-challenge-query': issuerAuthChallengeQuery,
  'protocols-json-query': protocolsJsonQuery
}

/**
 * Build a wallet-convenience link, or `undefined` when the construction is
 * `none`.
 *
 * ⚠️ `undefined` rather than an empty string: a key carrying `''` is a link a
 * wallet will try to follow.
 */
export const buildWalletLink = (
  construction: WalletLinkConstruction,
  base: string,
  inputs: WalletLinkInputs
): string | undefined =>
  construction === 'none' ? undefined : BUILDERS[construction](base, inputs)

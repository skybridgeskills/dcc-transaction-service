/**
 * Mints the `exchangeId` for a new exchange.
 *
 * Every exchange id in this service comes from here. It exists as a shared
 * helper rather than three inline `crypto.randomUUID()` calls because the
 * three `createExchange*` functions (`claim`, `didAuth`, `verify`) had already
 * drifted apart in every other respect, and an id minted with a prefix on two
 * workflows and without one on the third is worse than no prefix at all: the
 * caller's correlation silently holds for some exchanges and not others.
 *
 * The optional `exchangeIdPrefix` is a caller-supplied component of an
 * otherwise server-generated identifier. See
 * `docs/adr/2026-08-11-exchange-id-prefix.md` for why the id — rather than
 * `variables.retrievalId` or `variables.metadata`, both of which already
 * existed — is the field that carries a caller's correlation concept: the id
 * is the only one that appears on *every* observation channel at once (the
 * interaction URL, every discovery URL, a traffic capture, the device log,
 * the exchange record and every journal line), so tooling correlating an
 * exchange after the fact never has to read this service's store.
 *
 * The prefix is validated at the boundary (`exchangeIdPrefix` on
 * `vcApiExchangeCreateSchema`) and NOT here. This function is deliberately
 * total: it is called with values that have already been through Zod, and
 * having it silently sanitise would hide a validation gap rather than fail on
 * one. The value lands in 16 route paths and a Keyv key, so the boundary is
 * the only honest place to reject it.
 *
 * @param exchangeIdPrefix - validated `[A-Za-z0-9_-]{1,32}`, or undefined
 * @returns `<prefix>-<uuid>` when a prefix is supplied, a bare UUID otherwise
 */
export const mintExchangeId = (exchangeIdPrefix?: string): string =>
  exchangeIdPrefix
    ? `${exchangeIdPrefix}-${crypto.randomUUID()}`
    : crypto.randomUUID()

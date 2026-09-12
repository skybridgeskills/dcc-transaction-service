/**
 * Records which well-known construction a client elected when it fetched a
 * metadata document, onto the exchange record.
 *
 * ## Why this is written down at all
 *
 * This service serves issuer and authorization-server metadata under BOTH
 * well-known constructions (`hono.ts` — the RFC 8414 §3.1 path-suffix form and
 * the OIDC-Discovery concatenation), so it discriminates on neither. That
 * permissiveness is deliberate, and it has a cost: the thing a client got wrong
 * — or right — stops being visible in its outcome. Which construction a client
 * used is therefore a fact about the client that exists for the duration of one
 * request and then stops existing, unless it is persisted.
 *
 * ## Why a set, in fetch order
 *
 * Clients differ in a way a single value cannot express: one fetches both
 * constructions, another fetches only the concatenated form. "Tried both" and
 * "took the concatenated form" are different observations, and collapsing them
 * to a last-write-wins field would erase the difference.
 *
 * Repeats are not appended. A client polling discovery would otherwise grow an
 * unbounded array on a record that is written back on every fetch; the journal
 * already holds every individual fetch, with timestamps, so nothing is lost.
 *
 * ## Pure by design
 *
 * Returns the updated exchange and whether anything changed; the caller owns
 * persistence and the journal write, matching the shape of `ensureOid4vpState`
 * and `ensurePreAuthorizedCode`.
 */

/**
 * Append a construction/document pair to an exchange's elections if it is not
 * already there.
 *
 * @returns the exchange to persist, and `isNew` — false when this pair has
 * already been recorded, in which case the returned exchange is the input
 * unchanged and the caller can skip the write entirely.
 */
export const recordDiscoveryElection = <T extends App.ExchangeDetailBase>(
  exchange: T,
  construction: App.DiscoveryConstruction,
  doc: App.DiscoveryDoc,
  at: string = new Date().toISOString()
): { exchange: T; isNew: boolean } => {
  const current = exchange.discoveryElections ?? []
  if (
    current.some((e) => e.construction === construction && e.doc === doc)
  ) {
    return { exchange, isNew: false }
  }
  return {
    exchange: {
      ...exchange,
      discoveryElections: [...current, { construction, doc, at }]
    },
    isNew: true
  }
}

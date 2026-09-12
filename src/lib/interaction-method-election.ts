/**
 * Records which interaction method the interaction page displayed, and under
 * which construction, onto the exchange record.
 *
 * ⚠️ **Read `discovery-election.ts` first.** The two are the same mechanism on
 * two different observations — a client electing a well-known construction, and
 * a page electing an interaction method — and a reader who knows one should
 * recognise the other. Every property below has the same justification as its
 * counterpart there, and where this one differs it says why.
 *
 * ## Why this is written down at all
 *
 * `interaction-method-shown` already journals every reported interaction
 * method. That is half a mechanism, and `DiscoveryElection`'s own reasoning
 * says so:
 *
 * > *"Written to BOTH the exchange record and the journal — the two have
 * > different readers: a caller polling `GET` sees the field; a reader working
 * > from the durable journal after eviction sees the `discovery-served` lines."*
 *
 * ## Why a set, in first-election order
 *
 * *"Tried both"* and *"took the second one"* are different observations, and a
 * last-write-wins field erases the difference. That is the whole story of a
 * test run: an operator works down the picker until something renders, and
 * which interaction methods were tried before the one that worked is the
 * finding.
 *
 * Repeats are not appended. The journal already holds every individual event,
 * with timestamps, so nothing is lost — and an unbounded array on a record a
 * client can grow by polling is not acceptable. ⚠️ **Here that hazard is worse
 * than it is for discovery**, because `interaction-method-shown` takes its
 * *payload* from the client: the client picks the bytes. The caller therefore
 * only offers this function elections the server can rebuild — see `hono.ts`.
 *
 * ## Pure by design
 *
 * Returns the updated exchange and whether anything changed; the caller owns
 * persistence and the journal write, matching `recordDiscoveryElection`,
 * `ensureOid4vpState` and `ensurePreAuthorizedCode`.
 */

/**
 * Append an interaction method/construction pair to an exchange's elections if
 * it is not already there.
 *
 * ⚠️ Identity is the **pair** `(payloadId, protocolProfileName)`. The same
 * interaction method shown under two constructions is two observations; the
 * same pair shown twice is one.
 *
 * @returns the exchange to persist, and `isNew` — false when this pair has
 * already been recorded, in which case the returned exchange is the input
 * unchanged and the caller can skip the write entirely.
 */
export const recordInteractionMethodElection = <T extends App.ExchangeDetailBase>(
  exchange: T,
  election: Omit<App.InteractionMethodElection, 'at'>,
  at: string = new Date().toISOString()
): { exchange: T; isNew: boolean } => {
  const current = exchange.interactionMethodElections ?? []
  if (
    current.some(
      (e) =>
        e.payloadId === election.payloadId &&
        e.protocolProfileName === election.protocolProfileName
    )
  ) {
    return { exchange, isNew: false }
  }
  return {
    exchange: {
      ...exchange,
      interactionMethodElections: [...current, { ...election, at }]
    },
    isNew: true
  }
}

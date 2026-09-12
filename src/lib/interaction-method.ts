/**
 * What interaction method a scan went through — derived from the payload
 * itself.
 *
 * ## Why this is not the selector label
 *
 * The interaction page already names the candidate beside the QR ("Candidate
 * B/C — pinned OID4 construction"). **That caption is on screen even when the
 * wrong interaction method is scanned**, so a label the operator has to notice
 * is not enough. The discriminator that actually distinguishes them is
 * `client_id=` in the raw URL — a fact about the *payload*, not about the
 * control that produced it.
 *
 * So this reads the payload. A label can be stale, mis-selected or simply
 * unread; a description computed from the bytes in the QR cannot disagree with
 * what was scanned.
 *
 * ## Same reasoning as `discovery-served`
 *
 * The OID4VCI discovery routes write down which construction a wallet used
 * rather than inferring it from an outcome, because serving both makes the
 * service unable to discriminate on its own. The interaction method is the same
 * shape: the page offers every candidate, so which one was delivered has to be
 * recorded, not reconstructed.
 */

/** Delivery arm of an OID4VP authorization request. */
export type InteractionMethodDelivery = 'by-value' | 'by-reference'

export interface InteractionMethodDescription {
  /** URL scheme without the colon — `openid4vp`, `https`, `openid-credential-offer`. */
  scheme: string
  /**
   * OID4VP `client_id`. The discriminator that catches a scan pinned to the
   * wrong interaction method, and the one field that separates candidate A
   * from candidates B/C at a glance.
   */
  clientId?: string
  /**
   * `by-reference` when the request is fetched from `request_uri`,
   * `by-value` when it is inlined. Absent when the payload carries no OID4VP
   * authorization request at all.
   *
   * ⚠️ Worth having on the record: by-value removes the `request_uri` GET, which
   * is the only wire evidence a failed present produces on our side. A capture
   * with an empty wire means something different on each arm.
   */
  delivery?: InteractionMethodDelivery
  /**
   * The protocol profile the payload elects, when it names one.
   *
   * ⚠️ **Read out of the BYTES, never off the selection control.** The pin rides
   * as `?protocolProfile=` on the interaction URL, and one level deeper inside a
   * percent-encoded `request_uri` on the OID4VP arm — so it is a fact about the
   * QR, not about the control that produced it. This module's whole argument
   * applies: *"a label can be stale, mis-selected or simply unread; a
   * description computed from the bytes in the QR cannot disagree with what was
   * scanned."*
   *
   * ⚠️ **Absent does NOT mean "no profile".** It means the payload is the
   * exchange's active construction, whatever the server resolves that to — and
   * an unpinned payload is byte-identical to the default by construction, which
   * is what keeps the protocol goldens passing. The route resolves the name and
   * records `source: 'active'` so the two cases stay distinguishable on the
   * record.
   */
  protocolProfile?: string
  /** Characters in the payload — what drives QR density, and a cheap tell. */
  length: number
}

/**
 * The election a payload carries, from either position it can ride in.
 *
 * ⚠️ **Two positions, because there are two fetched URLs.** An interaction URL
 * carries it directly; an OID4VP deep link carries it inside the `request_uri`
 * the wallet will fetch, because that is the URL whose response the election
 * changes.
 *
 * ⚠️ **Total, like everything else here.** A `request_uri` that does not parse
 * yields no election rather than an error — an interaction method we cannot
 * parse is exactly the case where the evidence matters most.
 */
const electedProfileFrom = (params: URLSearchParams): string | undefined => {
  const direct = params.get('protocolProfile')
  if (direct) return direct
  const requestUri = params.get('request_uri')
  if (!requestUri) return undefined
  const inner = requestUri.indexOf('?')
  if (inner === -1) return undefined
  return (
    new URLSearchParams(requestUri.slice(inner + 1)).get('protocolProfile') ??
    undefined
  )
}

/**
 * Describe the payload a QR carries.
 *
 * Total: an unparseable payload still yields a description, because an
 * interaction method we cannot parse is exactly the case where the evidence
 * matters most.
 */
export const describeInteractionMethod = (payload: string): InteractionMethodDescription => {
  const length = payload.length
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(payload)
  const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : 'unknown'

  // `openid4vp://?a=b` has an empty authority, which `new URL` handles, but a
  // custom scheme without `//` does not always parse — read the query directly.
  const queryStart = payload.indexOf('?')
  if (queryStart === -1) return { scheme, length }

  const params = new URLSearchParams(payload.slice(queryStart + 1))
  const clientId = params.get('client_id') ?? undefined

  let delivery: InteractionMethodDelivery | undefined
  if (params.has('request_uri')) delivery = 'by-reference'
  else if (params.has('request') || params.has('presentation_definition') || params.has('dcql_query'))
    delivery = 'by-value'

  const protocolProfile = electedProfileFrom(params)

  return {
    scheme,
    ...(clientId ? { clientId } : {}),
    ...(delivery ? { delivery } : {}),
    ...(protocolProfile ? { protocolProfile } : {}),
    length
  }
}

/**
 * The interaction method in two tiers, because they answer two different
 * questions.
 *
 * The test this has to pass is the one the caption failed: *can the operator
 * confirm the right interaction method in one glance, without comparing
 * strings?*
 *
 * - {@link interactionMethodLine} is the glance. `openid4vp` versus `https` is
 *   the whole candidate-A question, and the delivery arm is the whole by-value
 *   question. ⚠️ **This once said the two lines "fit on one line at any width".
 *   They do not, and the sentence is corrected rather than the code.** Measured
 *   at `700 16px ui-monospace`, `openid4vp · by-reference · 246 chars` is 356
 *   px against the 312 px a 360 px phone leaves — it wraps, as does every
 *   OID4VP interaction method. It holds at 480 px, which is presumably where it
 *   was checked. Nothing needs fixing because the interaction page no longer
 *   renders this line at all; a future reader relying on the old claim would.
 * - {@link interactionMethodDetail} is the confirmation, for when the glance
 *   says the right thing and the operator wants to be sure. It carries the
 *   `client_id` — the discriminator that separates the draft `client_id`
 *   forms — shortened from the middle, since a 1.4 kB payload's `client_id`
 *   is itself long enough to need reading.
 *
 * Kept apart deliberately: a single line carrying all four wrapped to three
 * lines at 480 px and put the scheme, the most decisive field, in the middle of
 * a paragraph.
 *
 * ⚠️ **The elected profile is deliberately on NEITHER.** The payload string
 * itself is on screen now, and the elected construction is decoded beside it
 * under `Include advanced options`. {@link
 * InteractionMethodDescription.protocolProfile} exists for the record, not the
 * glance.
 */
export const interactionMethodLine = (d: InteractionMethodDescription): string => {
  const parts = [d.scheme]
  if (d.delivery) parts.push(d.delivery)
  parts.push(`${d.length} chars`)
  return parts.join(' · ')
}

/** The `client_id`, shortened, or `undefined` when the payload carries none. */
export const interactionMethodDetail = (d: InteractionMethodDescription): string | undefined =>
  d.clientId ? `client_id=${shorten(d.clientId)}` : undefined

/** Keep both ends — the scheme prefix and the host — and drop the middle. */
const shorten = (value: string, max = 44): string =>
  value.length <= max ? value : `${value.slice(0, max - 9)}…${value.slice(-8)}`

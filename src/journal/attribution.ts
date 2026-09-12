/**
 * Who asked — the small set of request headers worth keeping on a journal line.
 *
 * ## Why this exists
 *
 * A fetch is frequently the only trace a client leaves. Which client software
 * fetched, and whether it reached us from the device or through a relay, lives
 * on the wire for one request and then nowhere. For a wire-only wallet, where
 * there is no device log to fall back on, a journal line that does not name the
 * party leaves nothing that does — and a failure cannot then be attributed to
 * the side that caused it.
 *
 * So the fields that attribute a fetch to a *party* belong on the journal line
 * that records the fetch, not in a proxy's memory.
 *
 * ## Why an allow-list and not the headers
 *
 * Dumping `c.req.header()` would be one line and would be wrong. Inbound
 * requests carry `Authorization` — the journal has no TTL and is never
 * truncated, and `redact.ts` exists precisely because a credential written
 * there is written for good. The redactor would in fact catch a bearer token,
 * but relying on it to sanitise a firehose inverts the rule: the redactor is
 * the backstop, not the filter. **A writer names what it keeps.**
 *
 * Each field below earns its place by naming a party or a hop:
 *
 * - `userAgent` — which client software fetched.
 * - `forwardedFor` / `forwardedHost` / `forwardedProto` — whether the request
 *   crossed a proxy and what it thought it was reaching. A device fetch and a
 *   backend fetch relayed through a tunnel are otherwise indistinguishable.
 * - `referer` — set by browser-mediated arms (CHAPI, the web wallet) and absent
 *   on native ones, which is itself a discriminator.
 *
 * ⚠️ **Adding a header here is a decision, not a convenience.** The test in
 * `attribution.test.ts` pins the set so that widening it is a visible diff.
 */
import type { Context } from 'hono'

/**
 * Header → journal-field mapping. The value is the field name on the journal
 * line; the key is the wire header, lower-cased because Hono normalises
 * lookups but the constant should not depend on that.
 */
const KEPT_HEADERS = {
  'user-agent': 'userAgent',
  'x-forwarded-for': 'forwardedFor',
  'x-forwarded-host': 'forwardedHost',
  'x-forwarded-proto': 'forwardedProto',
  referer: 'referer'
} as const

/**
 * The attribution fields present on this request, as journal detail.
 *
 * Absent headers are omitted rather than written as `undefined`: a reader
 * counting how many fetches carried a `User-Agent` should be able to trust that
 * the key's presence means the header was there. `interaction-method-shown` and
 * `discovery-served` already follow that convention for their optional fields.
 */
export const requestAttribution = (c: Context): Record<string, string> => {
  const attribution: Record<string, string> = {}
  for (const [header, field] of Object.entries(KEPT_HEADERS)) {
    const value = c.req.header(header)
    if (value !== undefined && value !== '') attribution[field] = value
  }
  return attribution
}

/** The journal field names {@link requestAttribution} can emit. Test-facing. */
export const ATTRIBUTION_FIELDS = Object.values(KEPT_HEADERS)

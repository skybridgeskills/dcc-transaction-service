/**
 * The journal's single redaction rule.
 *
 * The journal deliberately keeps almost everything: request and response
 * bodies, credential contents, error payloads. That is the point — a record
 * that has been sanitised into uselessness cannot attribute a failure to a
 * cause, and attribution after the fact is the only reason the journal exists.
 *
 * **The one hard redaction is `Authorization` bearer tokens** — both the token
 * this service presents to the status service (`config.statusServiceToken`,
 * sent as `Authorization: Bearer …` from `claimWorkflow`) and any token an
 * inbound request carried. Those are live credentials; everything else on this
 * path is fixture data.
 *
 * Applied centrally, inside `appendJournalEntry`, rather than at each call
 * site. A redaction rule that each writer has to remember is a rule that gets
 * forgotten by the writer added six months later, and the failure mode is a
 * credential written to a file that has no TTL and is never truncated.
 */

/** Replacement text. Fixed string so a reader can grep for leaks-by-absence. */
export const REDACTED = '[REDACTED]'

/**
 * Header names whose value is a credential regardless of scheme. Matched
 * case-insensitively because header casing is not normalised anywhere on the
 * way in, and `axios` config objects carry whatever the caller typed.
 */
const AUTHORIZATION_KEY = /^(?:proxy-)?authorization$/i

/**
 * `Bearer <token>` appearing anywhere inside a string value — a stringified
 * request config, an error message that quoted the headers, a curl line in a
 * debug payload. The key-based rule above cannot see any of those.
 *
 * The scheme word is captured and re-emitted so the redacted line still shows
 * *what kind* of credential was there, which is the part that aids attribution.
 * The token character class is RFC 6750 §2.1 `b64token`.
 *
 * **Deliberately over-inclusive**: any word following `bearer` is treated as a
 * token, so the prose "the bearer of this credential" loses its "of". No
 * length or entropy floor is applied, because tuning one trades a word of
 * prose against a leaked credential in a file that has no TTL and is never
 * truncated — and a short opaque token is exactly what such a floor would miss.
 */
const BEARER_TOKEN = /\b(bearer)\s+[A-Za-z0-9\-._~+/]+=*/gi

/** Redact `Bearer <token>` occurrences inside a single string. */
export const redactBearerTokens = (value: string): string =>
  value.replace(BEARER_TOKEN, (_match, scheme: string) => `${scheme} ${REDACTED}`)

/**
 * Deep-copy `detail` with the redaction rule applied to every string and every
 * `Authorization`-shaped key at any depth.
 *
 * Copies rather than mutating: call sites hand us live objects (an exchange's
 * variables, an axios config) and the journal must not be able to change what
 * the request thread goes on to do with them.
 *
 * Two robustness concerns are handled here rather than at the writer, because
 * both would otherwise defeat redaction itself:
 *
 * - **Cycles.** Axios errors reference their own config and response. A cyclic
 *   payload must not throw on the way through the redactor, or a call site
 *   would learn to skip it.
 * - **`Error` instances.** `JSON.stringify(new Error('x'))` is `{}`, so an
 *   error captured verbatim would produce a journal line that says a failure
 *   happened and nothing about what it was. They are flattened to their own
 *   fields, which are then redacted like anything else — an upstream error
 *   message can quote an `Authorization` header.
 */
export const redactJournalDetail = (detail: unknown): unknown =>
  walk(detail, new WeakSet())

const walk = (value: unknown, seen: WeakSet<object>): unknown => {
  if (typeof value === 'string') return redactBearerTokens(value)
  if (value === null || typeof value !== 'object') return value

  // `seen` tracks the CURRENT PATH, not everything visited: an object is
  // removed again on the way out. Only a true cycle can then be reported as
  // one. A shared reference — the same array reachable by two paths, which is
  // ordinary in an upstream failure payload where the problem details appear
  // both on their own and inside the response body — is written out at each
  // path instead of collapsing to `[Circular]` at the second, which would
  // silently delete the evidence a later reader came for.
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  try {
    if (value instanceof Error) {
      return walk(
        {
          name: value.name,
          message: value.message,
          ...(value.stack ? { stack: value.stack } : {})
        },
        seen
      )
    }

    if (Array.isArray(value)) return value.map((item) => walk(item, seen))

    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      // A credential-bearing header is redacted whole. Its value may not be a
      // string (an axios header can be a number or an array), and it is never
      // something the journal needs, so nothing is gained by looking inside.
      out[key] = AUTHORIZATION_KEY.test(key) ? REDACTED : walk(item, seen)
    }
    return out
  } finally {
    seen.delete(value)
  }
}

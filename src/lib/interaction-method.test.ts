/**
 * The interaction method descriptor — the discriminator that catches a scan
 * pinned to the wrong interaction method, computed rather than read by eye.
 */
import { describe, expect, it } from 'vitest'
import { describeInteractionMethod, interactionMethodDetail, interactionMethodLine } from './interaction-method.js'

const BY_REFERENCE =
  'openid4vp://?client_id=redirect_uri%3Ahttps%3A%2F%2Fx.example%2Fresponse' +
  '&request_uri=https%3A%2F%2Fx.example%2Frequest'
const CANDIDATE_A = 'https://x.example/interactions/abc-123?payload=iu'

describe('describeInteractionMethod', () => {
  it('separates candidate A from an OID4VP method on the scheme alone', () => {
    expect(describeInteractionMethod(CANDIDATE_A).scheme).toBe('https')
    expect(describeInteractionMethod(BY_REFERENCE).scheme).toBe('openid4vp')
  })

  it('reads the client_id out of an openid4vp deep link', () => {
    expect(describeInteractionMethod(BY_REFERENCE).clientId).toBe(
      'redirect_uri:https://x.example/response'
    )
  })

  it('names the delivery arm — by-reference has a request_uri', () => {
    expect(describeInteractionMethod(BY_REFERENCE).delivery).toBe('by-reference')
  })

  it('names the delivery arm — by-value inlines the request instead', () => {
    const byValue =
      'openid4vp://?client_id=redirect_uri%3Ahttps%3A%2F%2Fx.example%2Fr' +
      '&dcql_query=%7B%7D&response_type=vp_token'
    expect(describeInteractionMethod(byValue).delivery).toBe('by-value')
  })

  it('leaves delivery absent when the payload carries no request at all', () => {
    expect(describeInteractionMethod(CANDIDATE_A).delivery).toBeUndefined()
  })

  it('describes an unparseable payload rather than throwing', () => {
    // An interaction method we cannot parse is exactly the case where the
    // evidence matters.
    expect(describeInteractionMethod('not a url at all')).toEqual({
      scheme: 'unknown',
      length: 16
    })
  })

  it('carries the length, which is what drives QR density', () => {
    expect(describeInteractionMethod(CANDIDATE_A).length).toBe(CANDIDATE_A.length)
  })
})

describe('interactionMethodLine', () => {
  it('leads with the scheme, so the candidate-A question is settled first', () => {
    expect(interactionMethodLine(describeInteractionMethod(CANDIDATE_A))).toMatch(/^https · /)
    expect(interactionMethodLine(describeInteractionMethod(BY_REFERENCE))).toMatch(/^openid4vp · /)
  })

  it('carries the delivery arm', () => {
    expect(interactionMethodLine(describeInteractionMethod(BY_REFERENCE))).toContain('by-reference')
  })

  it('stays on one line — no client_id, which is what made it wrap', () => {
    // A glance that wraps to three lines at 480px buries the scheme
    // mid-paragraph.
    expect(interactionMethodLine(describeInteractionMethod(BY_REFERENCE))).toBe(
      `openid4vp · by-reference · ${BY_REFERENCE.length} chars`
    )
  })
})

describe('interactionMethodDetail', () => {
  it('carries the client_id — the discriminator the comparison turned on', () => {
    expect(interactionMethodDetail(describeInteractionMethod(BY_REFERENCE))).toBe(
      'client_id=redirect_uri:https://x.example/response'
    )
  })

  it('shortens a long client_id from the middle, keeping both ends', () => {
    const long = `openid4vp://?client_id=${encodeURIComponent(
      `redirect_uri:https://very-long-host.example/${'p'.repeat(80)}/response`
    )}`
    const detail = interactionMethodDetail(describeInteractionMethod(long))!
    expect(detail).toContain('client_id=redirect_uri:https://very-long-host')
    expect(detail).toContain('…')
    expect(detail).toContain('response')
  })

  it('is absent when the payload carries no client_id', () => {
    expect(interactionMethodDetail(describeInteractionMethod(CANDIDATE_A))).toBeUndefined()
  })
})

/**
 * ⚠️ **The elected construction is a fact about the QR, not about the control
 * that produced it.** Same argument as the rest of this module: a selection can
 * be stale or mis-clicked; the bytes on screen cannot.
 */
describe('describeInteractionMethod · the elected protocol profile', () => {
  it('reads a pin off an interaction URL', () => {
    const payload =
      'https://x.example/interactions/exch-1?iuv=1&protocolProfile=vcapi-vpr-bare-origin-domain'
    expect(describeInteractionMethod(payload).protocolProfile).toBe(
      'vcapi-vpr-bare-origin-domain'
    )
  })

  it('⚠️ finds a pin nested inside a percent-encoded request_uri', () => {
    // The OID4VP arm carries it one level deeper, because `request_uri` is the
    // URL whose response the election actually changes.
    const inner =
      'https://x.example/openid4vp/request?protocolProfile=oid4vp-1.0-jwt-signed-by-reference-dcql-decentralized-identifier'
    const payload = `openid4vp://?client_id=redirect_uri%3Ahttps%3A%2F%2Fx.example%2Fresponse&request_uri=${encodeURIComponent(inner)}`
    expect(describeInteractionMethod(payload).protocolProfile).toBe(
      'oid4vp-1.0-jwt-signed-by-reference-dcql-decentralized-identifier'
    )
  })

  it('⚠️ is absent when the payload names none — which is not "no profile"', () => {
    expect(describeInteractionMethod(CANDIDATE_A).protocolProfile).toBeUndefined()
    expect(describeInteractionMethod(BY_REFERENCE).protocolProfile).toBeUndefined()
  })

  it('stays total on a request_uri that does not parse', () => {
    const payload = 'openid4vp://?request_uri=not%20a%20url'
    expect(() => describeInteractionMethod(payload)).not.toThrow()
    expect(describeInteractionMethod(payload).protocolProfile).toBeUndefined()
    expect(describeInteractionMethod(payload).delivery).toBe('by-reference')
  })

  it('⚠️ is on neither rendered line', () => {
    const payload =
      'https://x.example/interactions/exch-1?iuv=1&protocolProfile=some-profile'
    const method = describeInteractionMethod(payload)
    expect(interactionMethodLine(method)).not.toContain('some-profile')
    expect(interactionMethodDetail(method) ?? '').not.toContain('some-profile')
  })
})

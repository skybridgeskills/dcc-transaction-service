import { describe, expect, test } from 'vitest'
import { buildOid4vpDeepLink } from './deep-link.js'

describe('buildOid4vpDeepLink', () => {
  const clientId =
    'redirect_uri:https://verifier.example/workflows/verify/exchanges/e1/openid4vp/response'
  const requestUri =
    'https://verifier.example/workflows/verify/exchanges/e1/openid4vp/request'

  test('uses the openid4vp:// scheme with client_id + request_uri params', () => {
    const link = buildOid4vpDeepLink({ clientId, requestUri })
    expect(link.startsWith('openid4vp://?')).toBe(true)
    expect(link).toContain(`client_id=${encodeURIComponent(clientId)}`)
    expect(link).toContain(`request_uri=${encodeURIComponent(requestUri)}`)
  })

  test('round-trips the encoded params back to their originals', () => {
    const link = buildOid4vpDeepLink({ clientId, requestUri })
    const url = new URL(link)
    expect(url.searchParams.get('client_id')).toBe(clientId)
    expect(url.searchParams.get('request_uri')).toBe(requestUri)
  })
})

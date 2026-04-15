import { describe, expect, it } from 'vitest'
import { jwtDecodePayload } from './jwt-payload-decode.js'

describe('jwtDecodePayload', () => {
  it('decodes a minimal JWT payload', () => {
    const payload = { sub: 'user', n: 1 }
    const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
    const jwt = `eyJhbGciOiJub25lIn0.${b64}.sig`
    expect(jwtDecodePayload(jwt)).toEqual(payload)
  })

  it('throws on malformed JWT', () => {
    expect(() => jwtDecodePayload('not-a-jwt')).toThrow(/Invalid JWT/)
  })
})

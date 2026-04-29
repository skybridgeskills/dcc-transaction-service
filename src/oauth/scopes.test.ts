import { describe, expect, test } from 'vitest'
import { SCOPE_EXCHANGE_MANAGE, tokenHasScope } from './scopes.js'

describe('tokenHasScope', () => {
  test('matches single scope', () => {
    expect(tokenHasScope(SCOPE_EXCHANGE_MANAGE, SCOPE_EXCHANGE_MANAGE)).toBe(true)
  })

  test('matches one of several scopes', () => {
    expect(
      tokenHasScope(`openid ${SCOPE_EXCHANGE_MANAGE} profile`, SCOPE_EXCHANGE_MANAGE)
    ).toBe(true)
  })

  test('false when missing', () => {
    expect(tokenHasScope('openid profile', SCOPE_EXCHANGE_MANAGE)).toBe(false)
  })

  test('false for empty', () => {
    expect(tokenHasScope('', SCOPE_EXCHANGE_MANAGE)).toBe(false)
    expect(tokenHasScope(undefined, SCOPE_EXCHANGE_MANAGE)).toBe(false)
  })
})

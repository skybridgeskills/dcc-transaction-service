import Keyv from 'keyv'
import { describe, expect, test } from 'vitest'
import { keyvCacheStore } from './keyv-cache-store.js'

describe('keyvCacheStore', () => {
  test('get and set passthrough with TTL', async () => {
    const keyv = new Keyv()
    const store = keyvCacheStore(keyv)
    await store.set('k', { a: 1 }, 60_000)
    expect(await store.get('k')).toEqual({ a: 1 })
  })

  test('returns undefined for missing key', async () => {
    const store = keyvCacheStore(new Keyv())
    expect(await store.get('nope')).toBeUndefined()
  })
})

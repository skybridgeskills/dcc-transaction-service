import type { EntityIdentityRegistry } from '@digitalcredentials/verifier-core'
import Keyv from 'keyv'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TTL_MS } from '../cache-ttl.js'
import { lookupDccLegacy } from './dcc-legacy-handler.js'

const registryUrl = 'https://example.com/registry.json'

const dccRegistry: EntityIdentityRegistry = {
  name: 'Sandbox',
  type: 'dcc-legacy',
  url: registryUrl
}

const sampleBody = {
  meta: { updated: '2026-01-01T00:00:00+00:00' },
  registry: {
    'did:key:found': { name: 'Found Issuer', url: 'https://issuer.example' }
  }
}

describe('lookupDccLegacy', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns found when DID is in registry', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => sampleBody
    } as Response)

    const cache = new Keyv()
    const result = await lookupDccLegacy('did:key:found', dccRegistry, cache)
    expect(result).toEqual({ status: 'found', registryName: 'Sandbox' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('returns not-found when DID is absent', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => sampleBody
    } as Response)

    const cache = new Keyv()
    const result = await lookupDccLegacy('did:key:missing', dccRegistry, cache)
    expect(result).toEqual({ status: 'not-found' })
  })

  it('returns unchecked on fetch failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network'))

    const cache = new Keyv()
    const result = await lookupDccLegacy('did:key:found', dccRegistry, cache)
    expect(result).toEqual({
      status: 'unchecked',
      registryName: 'Sandbox'
    })
  })

  it('returns unchecked on non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers()
    } as Response)

    const cache = new Keyv()
    const result = await lookupDccLegacy('did:key:found', dccRegistry, cache)
    expect(result).toEqual({
      status: 'unchecked',
      registryName: 'Sandbox'
    })
  })

  it('returns unchecked on invalid JSON shape', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => ({ notRegistry: true })
    } as Response)

    const cache = new Keyv()
    const result = await lookupDccLegacy('did:key:found', dccRegistry, cache)
    expect(result).toEqual({
      status: 'unchecked',
      registryName: 'Sandbox'
    })
  })

  it('uses cache on second lookup (single fetch)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => sampleBody
    } as Response)

    const cache = new Keyv()
    await lookupDccLegacy('did:key:found', dccRegistry, cache)
    await lookupDccLegacy('did:key:found', dccRegistry, cache)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('passes Cache-Control max-age to cache TTL', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'cache-control': 'max-age=120' }),
      json: async () => sampleBody
    } as Response)

    const cache = new Keyv()
    const setSpy = vi.spyOn(cache, 'set')
    await lookupDccLegacy('did:key:found', dccRegistry, cache)
    expect(setSpy).toHaveBeenCalledWith(
      `dcc-legacy:${registryUrl}`,
      sampleBody,
      120_000
    )
  })

  it('uses default TTL when Cache-Control has no max-age', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => sampleBody
    } as Response)

    const cache = new Keyv()
    const setSpy = vi.spyOn(cache, 'set')
    await lookupDccLegacy('did:key:found', dccRegistry, cache)
    expect(setSpy).toHaveBeenCalledWith(
      `dcc-legacy:${registryUrl}`,
      sampleBody,
      DEFAULT_TTL_MS
    )
  })

  it('returns unchecked when registry type is not dcc-legacy', async () => {
    const oidf: EntityIdentityRegistry = {
      name: 'OIDF',
      type: 'oidf',
      trustAnchorEC: 'https://ta.example/.well-known/openid-federation'
    }
    const cache = new Keyv()
    const result = await lookupDccLegacy('did:key:x', oidf, cache)
    expect(result).toEqual({ status: 'unchecked', registryName: 'OIDF' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

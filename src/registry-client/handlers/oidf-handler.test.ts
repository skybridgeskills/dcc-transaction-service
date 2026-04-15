import type { EntityIdentityRegistry } from '@digitalcredentials/verifier-core'
import Keyv from 'keyv'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TTL_MS } from '../cache-ttl.js'
import { lookupOidf } from './oidf-handler.js'

const ecUrl = 'https://ta.example/.well-known/openid-federation'
const fetchEndpoint = 'https://op.example/federation-fetch'

const makeJwt = (payload: object): string => {
  const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `e.${b64}.s`
}

const entityPayload = {
  metadata: {
    federation_entity: {
      name: 'Trust Anchor',
      federation_fetch_endpoint: fetchEndpoint
    }
  }
}

const issuerPayload = { metadata: { sub: 'did:key:abc', organization_name: 'Issuer' } }

const oidfRegistry: EntityIdentityRegistry = {
  name: 'OIDF Test',
  type: 'oidf',
  trustAnchorEC: ecUrl
}

describe('lookupOidf', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('caches entity config JWT (single EC fetch across two lookups)', async () => {
    const issuerJwt = makeJwt(issuerPayload)
    const lookupUrl = `${fetchEndpoint}?sub=${encodeURIComponent('did:key:abc')}`

    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === ecUrl) {
        return {
          ok: true,
          headers: new Headers(),
          text: async () => makeJwt(entityPayload)
        } as Response
      }
      if (url === lookupUrl) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'cache-control': 'max-age=30' }),
          text: async () => issuerJwt
        } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const cache = new Keyv()
    await lookupOidf('did:key:abc', oidfRegistry, cache)
    await lookupOidf('did:key:abc', oidfRegistry, cache)

    expect(fetch).toHaveBeenCalled()
    const ecCalls = vi.mocked(fetch).mock.calls.filter((c) => c[0] === ecUrl)
    expect(ecCalls.length).toBe(1)
  })

  it('returns found when federation fetch returns 200', async () => {
    const issuerJwt = makeJwt(issuerPayload)
    const lookupUrl = `${fetchEndpoint}?sub=${encodeURIComponent('did:key:abc')}`

    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === ecUrl) {
        return {
          ok: true,
          headers: new Headers(),
          text: async () => makeJwt(entityPayload)
        } as Response
      }
      if (url === lookupUrl) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () => issuerJwt
        } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const cache = new Keyv()
    const result = await lookupOidf('did:key:abc', oidfRegistry, cache)
    expect(result).toEqual({ status: 'found', registryName: 'OIDF Test' })
  })

  it('returns not-found on 404 and does not cache lookup', async () => {
    const lookupUrl = `${fetchEndpoint}?sub=${encodeURIComponent('did:key:missing')}`

    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === ecUrl) {
        return {
          ok: true,
          headers: new Headers(),
          text: async () => makeJwt(entityPayload)
        } as Response
      }
      if (url === lookupUrl) {
        return {
          ok: false,
          status: 404,
          headers: new Headers()
        } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const cache = new Keyv()
    const result = await lookupOidf('did:key:missing', oidfRegistry, cache)
    expect(result).toEqual({ status: 'not-found' })
    expect(await cache.get(`oidf:lookup:${lookupUrl}`)).toBeUndefined()
  })

  it('returns unchecked on federation non-404 error', async () => {
    const lookupUrl = `${fetchEndpoint}?sub=${encodeURIComponent('did:key:x')}`

    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === ecUrl) {
        return {
          ok: true,
          headers: new Headers(),
          text: async () => makeJwt(entityPayload)
        } as Response
      }
      if (url === lookupUrl) {
        return {
          ok: false,
          status: 503,
          headers: new Headers()
        } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const cache = new Keyv()
    const result = await lookupOidf('did:key:x', oidfRegistry, cache)
    expect(result).toEqual({ status: 'unchecked', registryName: 'OIDF Test' })
  })

  it('returns unchecked when EC fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('down'))

    const cache = new Keyv()
    const result = await lookupOidf('did:key:x', oidfRegistry, cache)
    expect(result).toEqual({ status: 'unchecked', registryName: 'OIDF Test' })
  })

  it('respects Cache-Control max-age on DID lookup cache set', async () => {
    const issuerJwt = makeJwt(issuerPayload)
    const lookupUrl = `${fetchEndpoint}?sub=${encodeURIComponent('did:key:abc')}`

    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === ecUrl) {
        return {
          ok: true,
          headers: new Headers(),
          text: async () => makeJwt(entityPayload)
        } as Response
      }
      if (url === lookupUrl) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'cache-control': 'max-age=45' }),
          text: async () => issuerJwt
        } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const cache = new Keyv()
    const setSpy = vi.spyOn(cache, 'set')
    await lookupOidf('did:key:abc', oidfRegistry, cache)
    const lookupSet = setSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).startsWith('oidf:lookup:')
    )
    expect(lookupSet?.[2]).toBe(45_000)
  })

  it('caches DID lookup result and skips second federation fetch', async () => {
    const issuerJwt = makeJwt(issuerPayload)
    const lookupUrl = `${fetchEndpoint}?sub=${encodeURIComponent('did:key:abc')}`

    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === ecUrl) {
        return {
          ok: true,
          headers: new Headers(),
          text: async () => makeJwt(entityPayload)
        } as Response
      }
      if (url === lookupUrl) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () => issuerJwt
        } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const cache = new Keyv()
    await lookupOidf('did:key:abc', oidfRegistry, cache)
    await lookupOidf('did:key:abc', oidfRegistry, cache)

    const lookupCalls = vi.mocked(fetch).mock.calls.filter(
      (c) => c[0] === lookupUrl
    )
    expect(lookupCalls.length).toBe(1)
  })

  it('uses default TTL for entity config when no Cache-Control', async () => {
    const issuerJwt = makeJwt(issuerPayload)
    const lookupUrl = `${fetchEndpoint}?sub=${encodeURIComponent('did:key:abc')}`

    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === ecUrl) {
        return {
          ok: true,
          headers: new Headers(),
          text: async () => makeJwt(entityPayload)
        } as Response
      }
      if (url === lookupUrl) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () => issuerJwt
        } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const cache = new Keyv()
    const setSpy = vi.spyOn(cache, 'set')
    await lookupOidf('did:key:abc', oidfRegistry, cache)
    const ecSet = setSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).startsWith('oidf:ec:')
    )
    expect(ecSet?.[2]).toBe(DEFAULT_TTL_MS)
  })

  it('returns unchecked when registry type is not oidf', async () => {
    const dcc: EntityIdentityRegistry = {
      name: 'Legacy',
      type: 'dcc-legacy',
      url: 'https://example.com/r.json'
    }
    const cache = new Keyv()
    const result = await lookupOidf('did:key:x', dcc, cache)
    expect(result).toEqual({ status: 'unchecked', registryName: 'Legacy' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects issuer JWT without metadata', async () => {
    const badIssuerJwt = makeJwt({ foo: 1 })
    const lookupUrl = `${fetchEndpoint}?sub=${encodeURIComponent('did:key:abc')}`

    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === ecUrl) {
        return {
          ok: true,
          headers: new Headers(),
          text: async () => makeJwt(entityPayload)
        } as Response
      }
      if (url === lookupUrl) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () => badIssuerJwt
        } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const cache = new Keyv()
    const result = await lookupOidf('did:key:abc', oidfRegistry, cache)
    expect(result).toEqual({ status: 'unchecked', registryName: 'OIDF Test' })
  })
})

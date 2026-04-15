import type { EntityIdentityRegistry } from '@digitalcredentials/verifier-core'
import Keyv from 'keyv'
import { describe, expect, it } from 'vitest'
import { createCachedRegistryLookup } from './cached-registry-lookup.js'
import type { RegistryHandlerMap } from './types.js'

const dccRegistry: EntityIdentityRegistry = {
  name: 'Test Legacy',
  type: 'dcc-legacy',
  url: 'https://example.com/registry.json'
}

describe('createCachedRegistryLookup', () => {
  it('aggregates found and not-found across registries', async () => {
    const handlers: RegistryHandlerMap = {
      'dcc-legacy': async (_did, registry) => ({
        status: 'found',
        registryName: registry.name
      }),
      oidf: async () => ({ status: 'not-found' }),
      'vc-recognition': async () => ({ status: 'not-found' })
    }
    const lookup = createCachedRegistryLookup(new Keyv(), handlers)
    const result = await lookup('did:key:test', [dccRegistry])
    expect(result.found).toBe(true)
    expect(result.matchingRegistries).toEqual(['Test Legacy'])
    expect(result.uncheckedRegistries).toEqual([])
  })

  it('collects unchecked registry names', async () => {
    const handlers: RegistryHandlerMap = {
      'dcc-legacy': async (_did, registry) => ({
        status: 'unchecked',
        registryName: registry.name
      }),
      oidf: async () => ({ status: 'not-found' }),
      'vc-recognition': async () => ({ status: 'not-found' })
    }
    const lookup = createCachedRegistryLookup(new Keyv(), handlers)
    const result = await lookup('did:key:x', [dccRegistry])
    expect(result.found).toBe(false)
    expect(result.matchingRegistries).toEqual([])
    expect(result.uncheckedRegistries).toEqual(['Test Legacy'])
  })

  it('iterates multiple registries', async () => {
    const second: EntityIdentityRegistry = {
      name: 'Other',
      type: 'dcc-legacy',
      url: 'https://example.com/other.json'
    }
    const handlers: RegistryHandlerMap = {
      'dcc-legacy': async (did, registry) =>
        did === 'did:key:a'
          ? { status: 'found', registryName: registry.name }
          : { status: 'not-found' },
      oidf: async () => ({ status: 'not-found' }),
      'vc-recognition': async () => ({ status: 'not-found' })
    }
    const lookup = createCachedRegistryLookup(new Keyv(), handlers)
    const result = await lookup('did:key:a', [dccRegistry, second])
    expect(result.found).toBe(true)
    expect(result.matchingRegistries).toEqual(['Test Legacy', 'Other'])
  })
})

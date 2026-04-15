import type { DccLegacyEntityIdentityRegistry } from '@digitalcredentials/verifier-core'
import type Keyv from 'keyv'
import { parseCacheControlMaxAge, resolveTtl } from '../cache-ttl.js'
import type { HandlerResult, RegistryHandler } from '../types.js'

/**
 * DCC legacy registry JSON: a map of DID → issuer metadata under `registry`.
 *
 * @see https://digitalcredentials.github.io/sandbox-registry/registry.json
 */
export type DccLegacyRegistryBody = {
  registry: Record<string, { name?: string; url?: string; location?: string } | null>
}

/**
 * Fetch a DCC legacy registry JSON file, cache by URL, and resolve whether `did`
 * appears in `body.registry`.
 */
export const lookupDccLegacy: RegistryHandler = async (did, registry, cache) => {
  if (registry.type !== 'dcc-legacy') {
    return { status: 'unchecked', registryName: registry.name }
  }
  return lookupDccLegacyForRegistry(did, registry, cache)
}

async function lookupDccLegacyForRegistry(
  did: string,
  registry: DccLegacyEntityIdentityRegistry,
  cache: Keyv
): Promise<HandlerResult> {
  const key = cacheKeyForDccLegacyUrl(registry.url)
  let body = (await cache.get(key)) as DccLegacyRegistryBody | undefined

  if (!body) {
    const loaded = await fetchDccLegacyRegistry(registry)
    if (!loaded) {
      return { status: 'unchecked', registryName: registry.name }
    }
    body = loaded.body
    await cache.set(key, body, loaded.ttlMs)
  }

  const entry = body.registry[did]
  if (entry === undefined || entry === null) {
    return { status: 'not-found' }
  }
  return { status: 'found', registryName: registry.name }
}

async function fetchDccLegacyRegistry(
  registry: DccLegacyEntityIdentityRegistry
): Promise<{ body: DccLegacyRegistryBody; ttlMs: number } | null> {
  let response: Response
  try {
    response = await fetch(registry.url)
  } catch {
    return null
  }
  if (!response.ok) {
    return null
  }
  let json: unknown
  try {
    json = await response.json()
  } catch {
    return null
  }
  if (!isDccLegacyRegistryBody(json)) {
    return null
  }
  const ttlMs = resolveTtl(parseCacheControlMaxAge(response.headers))
  return { body: json, ttlMs }
}

function cacheKeyForDccLegacyUrl(url: string): string {
  return `dcc-legacy:${url}`
}

function isDccLegacyRegistryBody(value: unknown): value is DccLegacyRegistryBody {
  if (!value || typeof value !== 'object') {
    return false
  }
  const registry = (value as { registry?: unknown }).registry
  return (
    registry !== null &&
    typeof registry === 'object' &&
    !Array.isArray(registry)
  )
}

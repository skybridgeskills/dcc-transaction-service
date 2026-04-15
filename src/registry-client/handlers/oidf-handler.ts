import type { OidfEntityIdentityRegistry } from '@digitalcredentials/verifier-core'
import type Keyv from 'keyv'
import { parseCacheControlMaxAge, resolveTtl } from '../cache-ttl.js'
import { jwtDecodePayload } from '../jwt-payload-decode.js'
import type { HandlerResult, RegistryHandler } from '../types.js'

/**
 * OIDF trust-anchor lookup: entity configuration JWT, then federation fetch
 * for the issuer DID. Matches `@digitalcredentials/issuer-registry-client`
 * behavior (JWT payload decode only; no signature verification).
 */
export const lookupOidf: RegistryHandler = async (did, registry, cache) => {
  if (registry.type !== 'oidf') {
    return { status: 'unchecked', registryName: registry.name }
  }
  return lookupOidfForRegistry(did, registry, cache)
}

async function lookupOidfForRegistry(
  did: string,
  registry: OidfEntityIdentityRegistry,
  cache: Keyv
): Promise<HandlerResult> {
  const ecJwt = await getOrLoadEntityConfigJwt(registry.trustAnchorEC, cache)
  if (!ecJwt) {
    return { status: 'unchecked', registryName: registry.name }
  }

  let entityDecoded: unknown
  try {
    entityDecoded = jwtDecodePayload(ecJwt)
  } catch {
    return { status: 'unchecked', registryName: registry.name }
  }

  const fetchEndpoint = getFederationFetchEndpoint(entityDecoded)
  if (!fetchEndpoint) {
    return { status: 'unchecked', registryName: registry.name }
  }

  const lookupUrl = `${fetchEndpoint}?sub=${encodeURIComponent(did)}`
  const lookupKey = cacheKeyForOidfLookup(lookupUrl)

  const cachedIssuerJwt = (await cache.get(lookupKey)) as string | undefined
  if (cachedIssuerJwt) {
    return issuerJwtToResult(cachedIssuerJwt, registry.name)
  }

  let response: Response
  try {
    response = await fetch(lookupUrl)
  } catch {
    return { status: 'unchecked', registryName: registry.name }
  }

  if (response.status === 404) {
    return { status: 'not-found' }
  }
  if (!response.ok) {
    return { status: 'unchecked', registryName: registry.name }
  }

  let issuerJwt: string
  try {
    issuerJwt = await response.text()
  } catch {
    return { status: 'unchecked', registryName: registry.name }
  }

  const parsed = issuerJwtToResult(issuerJwt, registry.name)
  if (parsed.status !== 'found') {
    return parsed
  }

  const ttlMs = resolveTtl(parseCacheControlMaxAge(response.headers))
  await cache.set(lookupKey, issuerJwt, ttlMs)
  return { status: 'found', registryName: registry.name }
}

async function getOrLoadEntityConfigJwt(
  trustAnchorEcUrl: string,
  cache: Keyv
): Promise<string | null> {
  const key = cacheKeyForOidfEntityConfig(trustAnchorEcUrl)
  const cached = (await cache.get(key)) as string | undefined
  if (cached) {
    return cached
  }

  let response: Response
  try {
    response = await fetch(trustAnchorEcUrl)
  } catch {
    return null
  }
  if (!response.ok) {
    return null
  }

  let jwt: string
  try {
    jwt = await response.text()
  } catch {
    return null
  }

  try {
    const decoded = jwtDecodePayload(jwt)
    if (!getFederationFetchEndpoint(decoded)) {
      return null
    }
  } catch {
    return null
  }

  const ttlMs = resolveTtl(parseCacheControlMaxAge(response.headers))
  await cache.set(key, jwt, ttlMs)
  return jwt
}

function issuerJwtToResult(
  issuerJwt: string,
  registryName: string
): HandlerResult {
  try {
    const decoded = jwtDecodePayload(issuerJwt)
    if (!hasIssuerMetadata(decoded)) {
      return { status: 'unchecked', registryName }
    }
  } catch {
    return { status: 'unchecked', registryName }
  }
  return { status: 'found', registryName }
}

function getFederationFetchEndpoint(decoded: unknown): string | undefined {
  const endpoint = (
    decoded as {
      metadata?: { federation_entity?: { federation_fetch_endpoint?: string } }
    }
  )?.metadata?.federation_entity?.federation_fetch_endpoint
  return typeof endpoint === 'string' && endpoint.length > 0 ? endpoint : undefined
}

function hasIssuerMetadata(decoded: unknown): boolean {
  const metadata = (decoded as { metadata?: unknown }).metadata
  return metadata !== null && typeof metadata === 'object'
}

function cacheKeyForOidfEntityConfig(trustAnchorEcUrl: string): string {
  return `oidf:ec:${trustAnchorEcUrl}`
}

function cacheKeyForOidfLookup(lookupUrl: string): string {
  return `oidf:lookup:${lookupUrl}`
}

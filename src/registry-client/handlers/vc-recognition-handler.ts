import { verifyCredential } from '@digitalcredentials/verifier-core'
import type { VcRecognitionEntityIdentityRegistry } from '@digitalcredentials/verifier-core'
import type Keyv from 'keyv'
import { documentLoader } from '../../documentLoader.js'
import { resolveTtl, ttlFromValidUntil } from '../cache-ttl.js'
import type { HandlerResult, RegistryHandler } from '../types.js'

/**
 * VerifiableRecognitionCredential registry: fetch VC, verify issuer + proof,
 * cache until `validUntil`, then check `credentialSubject` for the DID.
 *
 * @see https://w3c.github.io/vc-recognition/
 */
export const lookupVcRecognition: RegistryHandler = async (did, registry, cache) => {
  if (registry.type !== 'vc-recognition') {
    return { status: 'unchecked', registryName: registry.name }
  }
  return lookupVcRecognitionForRegistry(did, registry, cache)
}

async function lookupVcRecognitionForRegistry(
  did: string,
  registry: VcRecognitionEntityIdentityRegistry,
  cache: Keyv
): Promise<HandlerResult> {
  const key = cacheKeyForVcRecognitionUrl(registry.url)
  let credential = (await cache.get(key)) as Record<string, unknown> | undefined

  if (!credential) {
    const loaded = await fetchRecognitionCredentialJson(registry.url)
    if (!loaded) {
      return { status: 'unchecked', registryName: registry.name }
    }

    const issuerId = getIssuerId(loaded)
    if (!issuerId || !registry.acceptedIssuers.includes(issuerId)) {
      return { status: 'unchecked', registryName: registry.name }
    }

    const verification = await verifyCredential({
      credential: loaded,
      documentLoader
    })

    if (!verification.verified) {
      return { status: 'unchecked', registryName: registry.name }
    }

    const validUntil =
      typeof loaded.validUntil === 'string' ? loaded.validUntil : undefined
    const ttlMs = resolveTtl(ttlFromValidUntil(validUntil ?? ''))
    await cache.set(key, loaded, ttlMs)
    credential = loaded
  }

  if (!subjectContainsDid(credential, did)) {
    return { status: 'not-found' }
  }
  return { status: 'found', registryName: registry.name }
}

function cacheKeyForVcRecognitionUrl(url: string): string {
  return `vc-recognition:${url}`
}

async function fetchRecognitionCredentialJson(
  url: string
): Promise<Record<string, unknown> | null> {
  let response: Response
  try {
    response = await fetch(url)
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
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return null
  }
  return json as Record<string, unknown>
}

function getIssuerId(credential: Record<string, unknown>): string | undefined {
  const issuer = credential.issuer
  if (typeof issuer === 'string') {
    return issuer
  }
  if (issuer && typeof issuer === 'object' && 'id' in issuer) {
    const id = (issuer as { id: unknown }).id
    return typeof id === 'string' ? id : undefined
  }
  return undefined
}

function subjectContainsDid(
  credential: Record<string, unknown>,
  did: string
): boolean {
  const subject = credential.credentialSubject
  if (subject === undefined || subject === null) {
    return false
  }
  if (Array.isArray(subject)) {
    return subject.some(
      (entry) =>
        entry !== null &&
        typeof entry === 'object' &&
        (entry as { id?: unknown }).id === did
    )
  }
  if (typeof subject === 'object') {
    return (subject as { id?: unknown }).id === did
  }
  return false
}

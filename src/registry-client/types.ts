import type Keyv from 'keyv'
import type { EntityIdentityRegistry } from '@digitalcredentials/verifier-core'

/** Outcome of looking up one issuer DID in a single registry entry. */
export type HandlerResult =
  | { status: 'found'; registryName: string }
  | { status: 'not-found' }
  | { status: 'unchecked'; registryName: string }

/**
 * Looks up a DID in one registry (fetch, cache, parse — type-specific).
 */
export type RegistryHandler = (
  did: string,
  registry: EntityIdentityRegistry,
  cache: Keyv
) => Promise<HandlerResult>

/** Per-type handlers used by {@link createCachedRegistryLookup}. */
export type RegistryHandlerMap = Record<
  EntityIdentityRegistry['type'],
  RegistryHandler
>

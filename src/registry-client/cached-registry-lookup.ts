import type Keyv from 'keyv'
import type { EntityIdentityRegistry, LookupIssuers } from '@digitalcredentials/verifier-core'
import { lookupDccLegacy } from './handlers/dcc-legacy-handler.js'
import { lookupOidf } from './handlers/oidf-handler.js'
import { lookupVcRecognition } from './handlers/vc-recognition-handler.js'
import type { HandlerResult, RegistryHandlerMap } from './types.js'

const defaultHandlers: RegistryHandlerMap = {
  'dcc-legacy': lookupDccLegacy,
  oidf: lookupOidf,
  'vc-recognition': lookupVcRecognition
}

const dispatch = async (
  did: string,
  registry: EntityIdentityRegistry,
  cache: Keyv,
  handlers: RegistryHandlerMap
): Promise<HandlerResult> => {
  switch (registry.type) {
    case 'dcc-legacy':
      return handlers['dcc-legacy'](did, registry, cache)
    case 'oidf':
      return handlers.oidf(did, registry, cache)
    case 'vc-recognition':
      return handlers['vc-recognition'](did, registry, cache)
  }
}

/**
 * Builds a {@link LookupIssuers} function backed by Keyv cache and per-type handlers.
 *
 * @param cache - Keyv store for registry payloads (namespace `registry` recommended)
 * @param handlers - Override handlers (defaults: DCC legacy, OIDF, VC recognition)
 */
export const createCachedRegistryLookup = (
  cache: Keyv,
  handlers: RegistryHandlerMap = defaultHandlers
): LookupIssuers => {
  return async (did, registries) => {
    const matchingRegistries: string[] = []
    const uncheckedRegistries: string[] = []

    for (const registry of registries) {
      const outcome = await dispatch(did, registry, cache, handlers)
      if (outcome.status === 'found') {
        matchingRegistries.push(outcome.registryName)
      } else if (outcome.status === 'unchecked') {
        uncheckedRegistries.push(outcome.registryName)
      }
    }

    return {
      found: matchingRegistries.length > 0,
      matchingRegistries,
      uncheckedRegistries
    }
  }
}

/** @see {@link createCachedRegistryLookup} */
export const CachedRegistryLookup = (cache: Keyv): LookupIssuers =>
  createCachedRegistryLookup(cache)

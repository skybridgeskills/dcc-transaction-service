import type { RegistryHandler } from '../types.js'

/**
 * DCC legacy registry lookup (fetch JSON map, cache, find DID).
 * Stub until phase 4.
 */
export const lookupDccLegacy: RegistryHandler = async () => {
  throw new Error('dcc-legacy handler: not implemented until phase 4')
}

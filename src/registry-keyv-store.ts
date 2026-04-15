/**
 * Singleton Keyv store for cached issuer registry payloads (namespace `registry`).
 */
import Keyv from 'keyv'
import { createKeyvStore } from './keyv-store.js'

let registryKeyv: Keyv | undefined

export const getRegistryKeyv = (): Keyv => {
  if (!registryKeyv) {
    registryKeyv = createKeyvStore('registry')
  }
  return registryKeyv
}

/** @internal Resets singleton (e.g. tests). */
export const resetRegistryKeyvForTests = (): void => {
  registryKeyv = undefined
}

getRegistryKeyv()

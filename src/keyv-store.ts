/**
 * Shared Keyv store factory — creates a Keyv instance with the appropriate
 * backend (Redis / file / in-memory) based on app config.
 *
 * Used by both the exchange transaction manager and the registry cache so
 * backend selection logic is not duplicated.
 */
import KeyvRedis from '@keyv/redis'
import Keyv from 'keyv'
import { KeyvFile } from 'keyv-file'
import { getConfig } from './config.js'

/**
 * Create a Keyv store with the configured backend.
 *
 * @param namespace - Redis/file namespace to isolate keys (e.g. `'exchange'`, `'registry'`)
 */
export const createKeyvStore = <T>(namespace: string): Keyv<T> => {
  const config = getConfig()

  if (config.keyvFilePath) {
    return new Keyv<T>({
      store: new KeyvFile({
        filename: config.keyvFilePath,
        expiredCheckDelay: config.keyvExpiredCheckDelayMs,
        writeDelay: config.keyvWriteDelayMs,
        serialize: JSON.stringify,
        deserialize: (val: string | Buffer<ArrayBufferLike>) =>
          JSON.parse(val.toString())
      }),
      namespace
    })
  }

  if (config.redisUri) {
    console.log(`Using redis backend for Keyv (${namespace}): ${config.redisUri}`)
    const hasPort = config.redisUri.includes('6379')
    return new Keyv<T>(
      new KeyvRedis(
        {
          url: hasPort ? config.redisUri : `rediss://${config.redisUri}:6379`,
          socket: { tls: !hasPort }
        },
        { namespace }
      )
    )
  }

  return new Keyv<T>({ namespace })
}

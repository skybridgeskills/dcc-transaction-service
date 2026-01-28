/**
 * FileKeyValueStoreService - file-based Keyv implementation
 * Used when keyvFilePath is configured
 */

import Keyv from 'keyv'
import { KeyvFile } from 'keyv-file'
import type { KeyValueStoreService } from './key-value-store-service.js'

export class FileKeyValueStoreService implements KeyValueStoreService {
  private keyv: Keyv<App.ExchangeDetailBase>

  constructor(config: App.Config) {
    if (!config.keyvFilePath) {
      throw new Error('keyvFilePath is required for FileKeyValueStoreService')
    }

    this.keyv = new Keyv<App.ExchangeDetailBase>({
      store: new KeyvFile({
        filename: config.keyvFilePath,
        expiredCheckDelay: config.keyvExpiredCheckDelayMs,
        writeDelay: config.keyvWriteDelayMs,
        serialize: JSON.stringify,
        deserialize: JSON.parse
      })
    })
  }

  async get<T = App.ExchangeDetailBase>(key: string): Promise<T | undefined> {
    return (await this.keyv.get(key)) as T | undefined
  }

  async set<T = App.ExchangeDetailBase>(
    key: string,
    value: T,
    ttl?: number
  ): Promise<boolean> {
    const success = await this.keyv.set(
      key,
      value as App.ExchangeDetailBase,
      ttl
    )
    return !!success
  }

  async delete(key: string): Promise<boolean> {
    return await this.keyv.delete(key)
  }

  async clear(): Promise<void> {
    await this.keyv.clear()
  }
}

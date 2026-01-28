/**
 * MemoryKeyValueStoreService - in-memory Keyv implementation
 * Used for testing and development
 */

import Keyv from 'keyv'
import type { KeyValueStoreService } from './key-value-store-service.js'

export class MemoryKeyValueStoreService implements KeyValueStoreService {
  private keyv: Keyv<App.ExchangeDetailBase>

  constructor() {
    this.keyv = new Keyv<App.ExchangeDetailBase>()
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

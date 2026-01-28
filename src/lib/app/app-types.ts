/**
 * App context types
 * Defines the shape of the app context that will be available via getApp()
 */

import type { ConfigService } from '../services/config-service.js'
import type { IssuerService } from '../services/issuer-service.js'
import type { KeyValueStoreService } from '../services/key-value-store-service.js'
import type { ExchangeService } from '../services/exchange-service.js'

export interface AppContext {
  configService: ConfigService
  issuerService?: IssuerService
  keyValueStore?: KeyValueStoreService
  exchangeService?: ExchangeService
  [key: string]: unknown
}

/**
 * Initial context that can be passed to getApp()
 * Allows overriding environment variables for testing
 */
export interface InitialAppContext {
  env?: {
    public?: Record<string, string>
    private?: Record<string, string>
  }
  [key: string]: unknown
}

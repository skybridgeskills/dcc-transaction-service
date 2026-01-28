/**
 * Provider pattern for building app context
 * Simple implementation that works with our AsyncLocalStorage-based app context
 */

import type { AppContext } from './app-types.js'
import { DefaultConfigService } from '../services/default-config-service.js'
import type { ConfigService } from '../services/config-service.js'
import type { IssuerService } from '../services/issuer-service.js'
import { FakeIssuerService } from '../services/fake-issuer-service.js'
import { VcApiIssuerService } from '../services/vc-api-issuer-service.js'
import type { KeyValueStoreService } from '../services/key-value-store-service.js'
import { MemoryKeyValueStoreService } from '../services/memory-key-value-store-service.js'
import { RedisKeyValueStoreService } from '../services/redis-key-value-store-service.js'
import { FileKeyValueStoreService } from '../services/file-key-value-store-service.js'
import type { ExchangeService } from '../services/exchange-service.js'
import { ExchangeServiceImpl } from '../exchanges/exchange-service.js'

/**
 * Provider function type
 */
export type ProviderFn<TInput = AppContext, TOutput = Partial<AppContext>> = (
  input: TInput
) => TOutput | Promise<TOutput>

/**
 * Creates the default app context with services based on configuration
 */
export function provideAppContext(
  initialCtx?: Partial<AppContext>
): AppContext {
  // Create config service if not provided
  const configService = initialCtx?.configService ?? new DefaultConfigService()
  const config = configService.getConfig()

  const ctx: AppContext = {
    ...initialCtx,
    configService
  }

  // Select issuer service based on configuration
  // If SIGNING_SERVICE env var is set and not default, use real service; otherwise use fake
  const signingServiceUrl = process.env.SIGNING_SERVICE ?? config.signingService
  const useRealService =
    signingServiceUrl && signingServiceUrl !== 'http://localhost:4006'

  if (useRealService) {
    ctx.issuerService = new VcApiIssuerService(config)
  } else {
    ctx.issuerService = new FakeIssuerService()
  }

  // Select key-value store service based on configuration
  // If keyValueStore is already provided (e.g., in tests), use it
  // Otherwise, select based on config: Redis > File > Memory
  if (!ctx.keyValueStore) {
    if (config.redisUri) {
      ctx.keyValueStore = new RedisKeyValueStoreService(config)
    } else if (config.keyvFilePath) {
      ctx.keyValueStore = new FileKeyValueStoreService(config)
    } else {
      // Default to memory for tests and development
      ctx.keyValueStore = new MemoryKeyValueStoreService()
    }
  }

  // Provide exchange service (always use the implementation)
  // If exchangeService is already provided (e.g., in tests), use it
  if (!ctx.exchangeService) {
    ctx.exchangeService = new ExchangeServiceImpl()
  }

  return ctx
}

/**
 * Test app context factory
 * Creates an app context with test-friendly service implementations
 * Follows the same pattern as createFakeConfigService
 */

import type { AppContext } from '../lib/app/app-types.js'
import { provideAppContext } from '../lib/app/app-providers.js'
import { createFakeConfigService } from '../lib/services/fake-config-service.js'
import { FakeIssuerService } from '../lib/services/fake-issuer-service.js'
import { MemoryKeyValueStoreService } from '../lib/services/memory-key-value-store-service.js'
import type { ExchangeService } from '../lib/services/exchange-service.js'
import { RealExchangeService } from '../lib/services/exchange-service.js'
import { vi } from 'vitest'

/**
 * Creates a fake exchange service for testing
 * Returns a RealExchangeService instance that uses the key-value store from app context
 * This allows all real service methods (including getExchangeProtocols) to work correctly
 * 
 * @param options - Optional configuration:
 *   - overrides: Partial exchange service to override specific methods (for backward compatibility)
 * @returns ExchangeService using real implementation
 * 
 * @example
 * ```ts
 * // Use defaults (real service - store must be provided in app context)
 * const exchangeService = createFakeExchangeService()
 * 
 * // Override specific methods (for backward compatibility)
 * const exchangeService = createFakeExchangeService({
 *   overrides: {
 *     getExchangeById: vi.fn().mockResolvedValue(customExchange)
 *   }
 * })
 * ```
 */
export function createFakeExchangeService(
  options?: {
    overrides?: Partial<ExchangeService>
  }
): ExchangeService {
  // Create real exchange service instance
  // Note: The service will use getApp() to access the key-value store from app context
  // The store must be provided to the app context for the service to work
  const realService = new RealExchangeService()
  
  // If no overrides, return the real service directly
  if (!options?.overrides || Object.keys(options.overrides).length === 0) {
    return realService
  }
  
  // Wrap in Proxy to allow method overrides while delegating to real service
  return new Proxy(realService, {
    get(target, prop) {
      // If override exists for this property, use it
      if (options.overrides && prop in options.overrides) {
        const override = options.overrides[prop as keyof ExchangeService]
        if (override !== undefined) {
          return override
        }
      }
      // Otherwise delegate to real service
      return target[prop as keyof RealExchangeService]
    }
  }) as ExchangeService
}

/**
 * Helper function to pre-populate exchanges in a key-value store
 * Use this when you need to set up test data before creating the app context
 */
export async function populateExchanges(
  keyValueStore: MemoryKeyValueStoreService,
  exchanges: Record<string, App.ExchangeDetailBase>
): Promise<void> {
  for (const [exchangeId, exchange] of Object.entries(exchanges)) {
    await keyValueStore.set(exchangeId, exchange)
  }
}

/**
 * Creates a test app context with default test-friendly services
 * 
 * @param overrides - Optional partial context to override defaults
 * @returns AppContext with test-friendly service implementations
 * 
 * @example
 * ```ts
 * // Use defaults
 * const ctx = createTestAppContext()
 * 
 * // Override config service
 * const ctx = createTestAppContext({
 *   configService: createFakeConfigService({ tenantAuthenticationEnabled: true })
 * })
 * 
 * // Override exchange service with custom behavior
 * const ctx = createTestAppContext({
 *   exchangeService: createFakeExchangeService({
 *     overrides: {
 *       getExchangeById: vi.fn().mockResolvedValue(createMockDidAuthExchange({ exchangeId: '123' }))
 *     }
 *   })
 * })
 * 
 * // Pre-populate exchanges (async)
 * const keyValueStore = new MemoryKeyValueStoreService()
 * await populateExchanges(keyValueStore, {
 *   'test-exchange-123': createMockDidAuthExchange({ exchangeId: 'test-exchange-123' })
 * })
 * const ctx = createTestAppContext({ keyValueStore })
 * ```
 */
export function createTestAppContext(
  overrides?: Partial<AppContext>
): AppContext {
  // Create a shared memory key-value store if not provided
  const keyValueStore = overrides?.keyValueStore || new MemoryKeyValueStoreService()
  
  // Create exchange service - if provided in overrides, use it; otherwise create default
  const exchangeService = overrides?.exchangeService 
    ? overrides.exchangeService
    : createFakeExchangeService()
  
  return provideAppContext({
    configService: createFakeConfigService(),
    issuerService: new FakeIssuerService(),
    keyValueStore,
    exchangeService,
    ...overrides
  })
}

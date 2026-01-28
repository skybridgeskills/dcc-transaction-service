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
import { createMockDidAuthExchange } from './testData.js'
import { vi } from 'vitest'

/**
 * Creates a fake exchange service for testing
 * Returns a mock exchange service with default implementations that return complete ExchangeDetailBase objects
 * 
 * @param overrides - Optional partial exchange service to override specific methods
 * @returns ExchangeService mock with sensible defaults
 * 
 * @example
 * ```ts
 * // Use defaults (all methods return complete exchange objects)
 * const exchangeService = createFakeExchangeService()
 * 
 * // Override getExchangeById to return specific data
 * const exchangeService = createFakeExchangeService({
 *   getExchangeById: vi.fn().mockResolvedValue(createMockDidAuthExchange({ exchangeId: '123' }))
 * })
 * ```
 */
export function createFakeExchangeService(
  overrides?: Partial<ExchangeService>
): ExchangeService {
  const defaultExchange = createMockDidAuthExchange()
  
  return {
    getExchangeById: vi.fn().mockResolvedValue(defaultExchange),
    getExchangeData: vi.fn().mockResolvedValue(defaultExchange),
    saveExchange: vi.fn().mockResolvedValue(true),
    clearExchanges: vi.fn().mockResolvedValue(undefined),
    ...overrides
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
 *     getExchangeById: vi.fn().mockResolvedValue(createMockDidAuthExchange({ exchangeId: '123' }))
 *   })
 * })
 * ```
 */
export function createTestAppContext(
  overrides?: Partial<AppContext>
): AppContext {
  return provideAppContext({
    configService: createFakeConfigService(),
    issuerService: new FakeIssuerService(),
    keyValueStore: new MemoryKeyValueStoreService(),
    exchangeService: createFakeExchangeService(),
    ...overrides
  })
}

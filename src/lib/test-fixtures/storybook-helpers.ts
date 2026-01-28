/**
 * Storybook test utilities
 * Lightweight, frontend-safe helpers for Storybook stories
 * Uses StorybookExchangeService (minimal implementation) instead of RealExchangeService
 * to avoid backend dependencies that cause Vite resolution errors
 */

import { StorybookExchangeService } from './storybook-exchange-service.js'
import type { ExchangeService } from '../services/exchange-service.js'

/**
 * Creates a complete Storybook setup with exchange service and pre-populated data
 *
 * @param exchanges Record of exchangeId -> exchange data to pre-populate
 * @returns Object with exchangeService
 *
 * @example
 * ```ts
 * const { exchangeService } = createStorybookSetup({
 *   'test-exchange-123': createStorybookClaimExchange({ exchangeId: 'test-exchange-123' })
 * })
 * ```
 */
export function createStorybookSetup(
	exchanges: Record<string, App.ExchangeDetailBase> = {}
): {
	exchangeService: ExchangeService
} {
	const exchangeService = new StorybookExchangeService()

	if (Object.keys(exchanges).length > 0) {
		exchangeService.addExchanges(exchanges)
	}

	return { exchangeService }
}

// Re-export commonly used test data creators for convenience
export {
	createStorybookClaimExchange,
	createStorybookDidAuthExchange,
	createStorybookVerifyExchange,
	createStorybookExchangeData
} from './storybook-exchange-data.js'

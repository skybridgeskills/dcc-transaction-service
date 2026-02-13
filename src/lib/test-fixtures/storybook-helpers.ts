/**
 * Storybook test utilities
 * Lightweight, frontend-safe helpers for Storybook stories
 * Uses FakeExchangeClient instead of server-side ExchangeService
 * to avoid backend dependencies that cause Vite resolution errors
 */

import { createFakeExchangeClient } from './fake-exchange-client.js'
import type { ExchangeClient } from '../services/ui/exchange-client.js'

/**
 * Creates a complete Storybook setup with exchange client and pre-populated data
 *
 * @param exchanges Record of exchangeId -> exchange data to pre-populate
 * @returns Object with exchangeClient
 *
 * @example
 * ```ts
 * const { exchangeClient } = createStorybookSetup({
 *   'test-exchange-123': createStorybookClaimExchange({ exchangeId: 'test-exchange-123' })
 * })
 * ```
 */
export function createStorybookSetup(
	exchanges: Record<string, App.ExchangeDetailBase> = {}
): {
	exchangeClient: ExchangeClient
} {
	// Convert exchanges to the format expected by FakeExchangeClient
	// Key format: `${workflowId}:${exchangeId}`
	const exchangeMap: Record<string, App.ExchangeDetailBase> = {}
	for (const exchange of Object.values(exchanges)) {
		const key = `${exchange.workflowId}:${exchange.exchangeId}`
		exchangeMap[key] = exchange
	}

	const exchangeClient = createFakeExchangeClient({
		exchanges: exchangeMap
	})

	return { exchangeClient }
}

// Re-export commonly used test data creators for convenience
export {
	createStorybookClaimExchange,
	createStorybookDidAuthExchange,
	createStorybookVerifyExchange,
	createStorybookExchangeData
} from './storybook-exchange-data.js'

import {
	getSupportedProtocols,
	getAvailableProtocolsFromExchange,
	findBestProtocol,
	getCompatibleWallets,
	createWalletSelection,
	shouldShowAdvancedProtocolSelection
} from './wallet-selector.js'
import { WALLET_CONFIGS } from './wallet-config.js'

describe('wallet-selector', () => {
	describe('getSupportedProtocols', () => {
		test('returns protocols sorted by priority', () => {
			const wallet = WALLET_CONFIGS.learnCard
			const protocols = getSupportedProtocols(wallet)
			expect(protocols.length).toBeGreaterThan(0)
			// Check that protocols are sorted by priority (ascending)
			for (let i = 0; i < protocols.length - 1; i++) {
				expect(protocols[i].priority).toBeLessThanOrEqual(
					protocols[i + 1].priority
				)
			}
		})
	})

	describe('getAvailableProtocolsFromExchange', () => {
		test('extracts OID4VP from verifiablePresentationRequest', () => {
			const protocols = getAvailableProtocolsFromExchange({
				verifiablePresentationRequest: { query: {} }
			})
			const oid4vp = protocols.find((p) => p.type === 'OID4VP')
			expect(oid4vp).toBeDefined()
		})

		test('extracts OID4VCI from OID4VCI URL', () => {
			const protocols = getAvailableProtocolsFromExchange({
				OID4VCI: 'openid-credential-offer://?credential_offer_uri=test'
			})
			const oid4vci = protocols.find((p) => p.type === 'OID4VCI')
			expect(oid4vci).toBeDefined()
			expect(oid4vci?.url).toBe('openid-credential-offer://?credential_offer_uri=test')
		})

		test('extracts LCW from lcw URL', () => {
			const protocols = getAvailableProtocolsFromExchange({
				lcw: 'lcw://test-url'
			})
			const lcw = protocols.find((p) => p.type === 'LCW')
			expect(lcw).toBeDefined()
			expect(lcw?.url).toBe('lcw://test-url')
		})

		test('extracts VCAPI from vcapi URL', () => {
			const protocols = getAvailableProtocolsFromExchange({
				vcapi: 'https://example.com/vcapi'
			})
			const vcapi = protocols.find((p) => p.type === 'VCAPI')
			expect(vcapi).toBeDefined()
			expect(vcapi?.url).toBe('https://example.com/vcapi')
		})

		test('extracts IU from iu URL', () => {
			const protocols = getAvailableProtocolsFromExchange({
				iu: 'https://example.com/interactions/123'
			})
			const iu = protocols.find((p) => p.type === 'IU')
			expect(iu).toBeDefined()
			expect(iu?.url).toBe('https://example.com/interactions/123')
		})

		test('handles multiple protocols', () => {
			const protocols = getAvailableProtocolsFromExchange({
				verifiablePresentationRequest: { query: {} },
				OID4VCI: 'openid-credential-offer://?credential_offer_uri=test',
				lcw: 'lcw://test'
			})
			expect(protocols.length).toBeGreaterThanOrEqual(3)
		})
	})

	describe('findBestProtocol', () => {
		test('returns highest priority protocol that is available', () => {
			const wallet = WALLET_CONFIGS.learnCard
			const availableProtocols = [
				{ type: 'VCAPI' as const, url: 'https://example.com' },
				{ type: 'OID4VP' as const },
				{ type: 'OID4VCI' as const, url: 'test' }
			]
			const best = findBestProtocol(wallet, availableProtocols)
			// LearnCard has OID4VP as priority 1, OID4VCI as priority 2
			expect(best).toBe('OID4VP')
		})

		test('returns null if no protocols match', () => {
			const wallet = WALLET_CONFIGS.learnCard
			const availableProtocols = [{ type: 'LCW' as const, url: 'test' }]
			const best = findBestProtocol(wallet, availableProtocols)
			expect(best).toBeNull()
		})
	})

	describe('getCompatibleWallets', () => {
		test('returns wallets that support at least one available protocol', () => {
			const availableProtocols = [
				{ type: 'OID4VP' as const },
				{ type: 'OID4VCI' as const, url: 'test' }
			]
			const compatible = getCompatibleWallets(availableProtocols)
			expect(compatible.length).toBeGreaterThan(0)
			for (const wallet of compatible) {
				const supportsAtLeastOne = wallet.supportedProtocols.some((p) =>
					availableProtocols.some((ap) => ap.type === p.type)
				)
				expect(supportsAtLeastOne).toBe(true)
			}
		})

		test('returns empty array if no wallets support available protocols', () => {
			const availableProtocols = [
				{ type: 'UNSUPPORTED' as any, url: 'test' }
			]
			const compatible = getCompatibleWallets(availableProtocols)
			expect(compatible.length).toBe(0)
		})
	})

	describe('createWalletSelection', () => {
		test('creates selection with auto-selected protocol', () => {
			const availableProtocols = [
				{ type: 'OID4VP' as const },
				{ type: 'OID4VCI' as const, url: 'test' }
			]
			const selection = createWalletSelection(
				'learncard',
				availableProtocols
			)
			expect(selection).not.toBeNull()
			expect(selection?.wallet.id).toBe('learncard')
			expect(selection?.selectedProtocol).toBe('OID4VP') // Highest priority
			expect(selection?.availableProtocols.length).toBeGreaterThan(0)
		})

		test('creates selection with specified protocol', () => {
			const availableProtocols = [
				{ type: 'OID4VP' as const },
				{ type: 'OID4VCI' as const, url: 'test' }
			]
			const selection = createWalletSelection(
				'learncard',
				availableProtocols,
				'OID4VCI'
			)
			expect(selection).not.toBeNull()
			expect(selection?.selectedProtocol).toBe('OID4VCI')
		})

		test('returns null for invalid wallet ID', () => {
			const availableProtocols = [{ type: 'OID4VP' as const }]
			const selection = createWalletSelection(
				'invalid-wallet',
				availableProtocols
			)
			expect(selection).toBeNull()
		})

		test('returns null if wallet has no compatible protocols', () => {
			const availableProtocols = [{ type: 'LCW' as const, url: 'test' }]
			const selection = createWalletSelection(
				'learncard',
				availableProtocols
			)
			expect(selection).toBeNull()
		})
	})

	describe('shouldShowAdvancedProtocolSelection', () => {
		test('returns true when multiple protocols available', () => {
			const wallet = WALLET_CONFIGS.learnCard
			const availableProtocols = [
				{ type: 'OID4VP' as const },
				{ type: 'OID4VCI' as const, url: 'test' }
			]
			const shouldShow = shouldShowAdvancedProtocolSelection(
				wallet,
				availableProtocols
			)
			expect(shouldShow).toBe(true)
		})

		test('returns false when only one protocol available', () => {
			const wallet = WALLET_CONFIGS.learnCard
			const availableProtocols = [{ type: 'OID4VP' as const }]
			const shouldShow = shouldShowAdvancedProtocolSelection(
				wallet,
				availableProtocols
			)
			expect(shouldShow).toBe(false)
		})
	})
})

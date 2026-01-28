import { expect, test, describe } from 'vitest'
import {
	getWalletConfig,
	getAllWalletConfigs,
	getWalletsForProtocol,
	WALLET_CONFIGS,
	type ProtocolType
} from './wallet-config.js'

describe('wallet-config', () => {
	describe('getWalletConfig', () => {
		test('returns wallet config for valid wallet ID', () => {
			const config = getWalletConfig('lcw')
			expect(config).toBeDefined()
			expect(config?.id).toBe('lcw')
			expect(config?.name).toBe('Learner Credential Wallet')
		})

		test('returns undefined for invalid wallet ID', () => {
			const config = getWalletConfig('invalid-wallet')
			expect(config).toBeUndefined()
		})
	})

	describe('getAllWalletConfigs', () => {
		test('returns all wallet configurations', () => {
			const configs = getAllWalletConfigs()
			expect(configs.length).toBeGreaterThan(0)
			expect(configs.length).toBe(Object.keys(WALLET_CONFIGS).length)
		})

		test('all configs have required fields', () => {
			const configs = getAllWalletConfigs()
			for (const config of configs) {
				expect(config.id).toBeDefined()
				expect(config.name).toBeDefined()
				expect(config.description).toBeDefined()
				expect(config.supportedProtocols).toBeDefined()
				expect(config.supportedProtocols.length).toBeGreaterThan(0)
				expect(config.deepLinkSchemes).toBeDefined()
				expect(typeof config.prefersSameDevice).toBe('boolean')
			}
		})
	})

	describe('getWalletsForProtocol', () => {
		test('returns wallets that support OID4VP', () => {
			const wallets = getWalletsForProtocol('OID4VP')
			expect(wallets.length).toBeGreaterThan(0)
			for (const wallet of wallets) {
				const supportsProtocol = wallet.supportedProtocols.some(
					(p) => p.type === 'OID4VP'
				)
				expect(supportsProtocol).toBe(true)
			}
		})

		test('returns wallets that support OID4VCI', () => {
			const wallets = getWalletsForProtocol('OID4VCI')
			expect(wallets.length).toBeGreaterThan(0)
			for (const wallet of wallets) {
				const supportsProtocol = wallet.supportedProtocols.some(
					(p) => p.type === 'OID4VCI'
				)
				expect(supportsProtocol).toBe(true)
			}
		})

		test('returns empty array for unsupported protocol', () => {
			// Assuming 'UNSUPPORTED' is not a valid protocol
			const wallets = getWalletsForProtocol('UNSUPPORTED' as ProtocolType)
			expect(wallets.length).toBe(0)
		})
	})

	describe('wallet configurations', () => {
		test('LCW wallet has correct configuration', () => {
			const lcw = WALLET_CONFIGS.lcw
			expect(lcw.id).toBe('lcw')
			expect(lcw.supportedProtocols.some((p) => p.type === 'LCW')).toBe(true)
			expect(lcw.deepLinkSchemes.LCW).toBe('lcw://')
		})

		test('ASU Pocket wallet has correct configuration', () => {
			const asuPocket = WALLET_CONFIGS.asuPocket
			expect(asuPocket.id).toBe('asu-pocket')
			expect(
				asuPocket.supportedProtocols.some((p) => p.type === 'OID4VP')
			).toBe(true)
			expect(asuPocket.deepLinkSchemes.OID4VP).toBe('asupocket://')
			expect(asuPocket.prefersSameDevice).toBe(true)
		})

		test('LearnCard wallet has correct configuration', () => {
			const learnCard = WALLET_CONFIGS.learnCard
			expect(learnCard.id).toBe('learncard')
			expect(
				learnCard.supportedProtocols.some((p) => p.type === 'OID4VP')
			).toBe(true)
			expect(learnCard.deepLinkSchemes.OID4VP).toBe('openid4vp://')
			expect(learnCard.deepLinkSchemes.OID4VCI).toBe(
				'openid-credential-offer://'
			)
		})
	})
})

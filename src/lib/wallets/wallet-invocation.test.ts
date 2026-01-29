import {
	generateDeepLinkUrl,
	generateQRCodeDataUrl,
	generateInvocation,
	generateOID4VPDeepLink,
	generateOID4VCIDeepLink
} from './wallet-invocation.js'
import { WALLET_CONFIGS } from './wallet-config.js'
import type { AvailableProtocol } from './wallet-selector.js'

describe('wallet-invocation', () => {
	describe('generateDeepLinkUrl', () => {
		test('generates OID4VCI deep link correctly', () => {
			const wallet = WALLET_CONFIGS.learnCard
			const url = 'https://example.com/credential-offer'
			const deepLink = generateDeepLinkUrl('OID4VCI', wallet, url)
			expect(deepLink).toBe(
				'openid-credential-offer://?credential_offer_uri=' +
					encodeURIComponent(url)
			)
		})

		test('generates OID4VP deep link correctly', () => {
			const wallet = WALLET_CONFIGS.asuPocket
			const url = 'https://example.com/vp-request'
			const deepLink = generateDeepLinkUrl('OID4VP', wallet, url)
			expect(deepLink).toBe('asupocket://?request_uri=' + encodeURIComponent(url))
		})

		test('generates LCW deep link correctly', () => {
			const wallet = WALLET_CONFIGS.lcw
			const url = 'https://example.com/lcw'
			const deepLink = generateDeepLinkUrl('LCW', wallet, url)
			expect(deepLink).toBe('lcw://https://example.com/lcw')
		})

		test('returns null when scheme not available', () => {
			const wallet = WALLET_CONFIGS.lcw
			const deepLink = generateDeepLinkUrl('OID4VP', wallet, 'test')
			expect(deepLink).toBeNull()
		})

		test('returns null when URL not provided', () => {
			const wallet = WALLET_CONFIGS.learnCard
			const deepLink = generateDeepLinkUrl('OID4VCI', wallet)
			expect(deepLink).toBeNull()
		})
	})

	describe('generateQRCodeDataUrl', () => {
		test('generates QR code data URL', async () => {
			const dataUrl = await generateQRCodeDataUrl('test-data')
			expect(dataUrl).toBeDefined()
			expect(dataUrl).toMatch(/^data:image\/png;base64,/)
		})

		test('generates QR code with custom options', async () => {
			const dataUrl = await generateQRCodeDataUrl('test-data', {
				width: 200
			})
			expect(dataUrl).toBeDefined()
			expect(dataUrl).toMatch(/^data:image\/png;base64,/)
		})
	})

	describe('generateInvocation', () => {
		test('generates QR code for cross-device flow', async () => {
			const wallet = WALLET_CONFIGS.learnCard
			const protocol: AvailableProtocol = {
				type: 'OID4VCI',
				url: 'https://example.com/credential-offer'
			}
			const result = await generateInvocation(
				wallet,
				'OID4VCI',
				protocol,
				false
			)
			expect(result.qrCodeDataUrl).toBeDefined()
			expect(result.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/)
		})

		test('generates deep link for same-device flow', async () => {
			const wallet = WALLET_CONFIGS.asuPocket
			const protocol: AvailableProtocol = {
				type: 'OID4VP',
				url: 'https://example.com/vp-request'
			}
			const result = await generateInvocation(
				wallet,
				'OID4VP',
				protocol,
				true
			)
			expect(result.deepLinkUrl).toBeDefined()
			expect(result.deepLinkUrl).toContain('asupocket://')
		})

		test('uses wallet preference when not specified', async () => {
			const wallet = WALLET_CONFIGS.asuPocket // prefersSameDevice: true
			const protocol: AvailableProtocol = {
				type: 'OID4VP',
				url: 'https://example.com/vp-request'
			}
			const result = await generateInvocation(
				wallet,
				'OID4VP',
				protocol
			)
			expect(result.deepLinkUrl).toBeDefined()
		})

		test('falls back to URL when deep link not available', async () => {
			const wallet = WALLET_CONFIGS.lcw
			const protocol: AvailableProtocol = {
				type: 'OID4VP',
				url: 'https://example.com/vp-request'
			}
			// LCW doesn't have OID4VP deep link scheme
			const result = await generateInvocation(
				wallet,
				'OID4VP',
				protocol,
				true
			)
			expect(result.url).toBe('https://example.com/vp-request')
		})
	})

	describe('generateOID4VPDeepLink', () => {
		test('generates standard OID4VP deep link', () => {
			const requestUri = 'https://example.com/vp-request'
			const deepLink = generateOID4VPDeepLink(requestUri)
			expect(deepLink).toBe(
				'openid4vp://?request_uri=' + encodeURIComponent(requestUri)
			)
		})

		test('generates OID4VP deep link with custom scheme', () => {
			const requestUri = 'https://example.com/vp-request'
			const deepLink = generateOID4VPDeepLink(requestUri, 'custom://')
			expect(deepLink).toBe('custom://?request_uri=' + encodeURIComponent(requestUri))
		})
	})

	describe('generateOID4VCIDeepLink', () => {
		test('generates standard OID4VCI deep link', () => {
			const credentialOfferUri = 'https://example.com/credential-offer'
			const deepLink = generateOID4VCIDeepLink(credentialOfferUri)
			expect(deepLink).toBe(
				'openid-credential-offer://?credential_offer_uri=' +
					encodeURIComponent(credentialOfferUri)
			)
		})

		test('generates OID4VCI deep link with custom scheme', () => {
			const credentialOfferUri = 'https://example.com/credential-offer'
			const deepLink = generateOID4VCIDeepLink(credentialOfferUri, 'custom://')
			expect(deepLink).toBe(
				'custom://?credential_offer_uri=' +
					encodeURIComponent(credentialOfferUri)
			)
		})
	})
})

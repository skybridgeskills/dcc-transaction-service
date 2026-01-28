import { describe, test, expect } from 'vitest';
import { FakeWalletService } from './fake-wallet-service.js';

describe('FakeWalletService', () => {
	test('signs a presentation with default key', async () => {
		const service = new FakeWalletService();
		const presentation = {
			'@context': ['https://www.w3.org/2018/credentials/v1'],
			type: ['VerifiablePresentation'],
			verifiableCredential: []
		};
		const challenge = 'test-challenge-123';

		const signed = await service.signPresentation(presentation, challenge);

		expect(signed).toBeDefined();
		expect(signed.proof).toBeDefined();
		expect(signed.holder).toBeDefined();
		expect(signed.type).toEqual(['VerifiablePresentation']);
	});

	test('creates and signs a presentation with credentials', async () => {
		const service = new FakeWalletService();
		const credentials = [
			{
				'@context': ['https://www.w3.org/2018/credentials/v1'],
				type: ['VerifiableCredential'],
				credentialSubject: { id: 'did:example:subject' }
			}
		];
		const challenge = 'test-challenge-456';

		const signed = await service.createAndSignPresentation(credentials, challenge);

		expect(signed).toBeDefined();
		expect(signed.proof).toBeDefined();
		expect(signed.holder).toBeDefined();
		expect(signed.verifiableCredential).toEqual(credentials);
	});

	test('signs a presentation with custom wallet DID', async () => {
		const customDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
		const service = new FakeWalletService();
		const presentation = {
			'@context': ['https://www.w3.org/2018/credentials/v1'],
			type: ['VerifiablePresentation'],
			verifiableCredential: []
		};
		const challenge = 'test-challenge-789';

		const signed = await service.signPresentation(presentation, challenge, {
			walletDid: customDid
		});

		expect(signed.holder).toBe(customDid);
		expect(signed.proof).toBeDefined();
	});
});

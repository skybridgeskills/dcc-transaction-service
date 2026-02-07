<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, within, waitFor } from 'storybook/test'
	import {
		createStorybookSetup,
		createStorybookClaimExchange,
		createStorybookVerifyExchange
	} from '../test-fixtures/storybook-helpers.js'

	import InteractionPage from './InteractionPage.svelte'

	const { Story } = defineMeta({
		title: 'Pages/InteractionPage',
		argTypes: {
			exchangeId: {
				control: 'text',
				description: 'Exchange ID'
			},
			workflowId: {
				control: 'select',
				options: ['claim', 'didAuth', 'verify'],
				description: 'Workflow ID'
			}
		},
		args: {}
	})

	// Setup for claim exchange
	const claimExchangeSetup = createStorybookSetup({
		'claim-exchange-123': createStorybookClaimExchange({
			exchangeId: 'claim-exchange-123',
			state: 'pending'
		}),
		'claim-exchange-complete': createStorybookClaimExchange({
			exchangeId: 'claim-exchange-complete',
			state: 'complete'
		}),
		'claim-exchange-invalid': createStorybookClaimExchange({
			exchangeId: 'claim-exchange-invalid',
			state: 'invalid'
		})
	})

	// Setup for verify exchange
	const verifyExchangeSetup = createStorybookSetup({
		'verify-exchange-123': createStorybookVerifyExchange({
			exchangeId: 'verify-exchange-123',
			state: 'pending',
			variables: {
				vprContext: ['https://www.w3.org/2018/credentials/v1'],
				vprCredentialType: ['VerifiableCredential', 'OpenBadgeCredential'],
				vprClaims: [
					{ path: ['credentialSubject', 'name'] },
					{ path: ['credentialSubject', 'achievement'], values: ['Test Achievement'] }
				],
				trustedIssuers: ['did:example:issuer1', 'did:example:issuer2'],
				trustedRegistries: ['https://registry.example.com']
			}
		}),
		'verify-exchange-complete': createStorybookVerifyExchange({
			exchangeId: 'verify-exchange-complete',
			state: 'complete',
			variables: {
				vprContext: ['https://www.w3.org/2018/credentials/v1'],
				vprCredentialType: ['VerifiableCredential']
			}
		}),
		'verify-exchange-invalid': createStorybookVerifyExchange({
			exchangeId: 'verify-exchange-invalid',
			state: 'invalid',
			variables: {
				vprContext: ['https://www.w3.org/2018/credentials/v1'],
				vprCredentialType: ['VerifiableCredential']
			}
		})
	})
</script>

<!-- Verification Workflow Stories -->
<Story
	name="VerificationPending"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await waitFor(
			() => {
				const title = canvas.getByText(/present your credential/i)
				expect(title).toBeInTheDocument()
			},
			{ timeout: 2000 }
		)

		// Check that credential types are displayed
		const credentialTypes = canvas.getAllByTestId(/^credential-type-/)
		expect(credentialTypes.length).toBeGreaterThan(0)

		// Check that wallet selector is shown
		const walletSelector = canvas.getByTestId('interaction-page')
		expect(walletSelector).toBeInTheDocument()
	}}
>
	{@const exchange = verifyExchangeSetup.exchangeService.getExchangeData('verify-exchange-123', 'verify')}
	{#await exchange then exchangeData}
		<InteractionPage
			exchangeService={verifyExchangeSetup.exchangeService}
			exchange={exchangeData}
		/>
	{/await}
</Story>

<Story
	name="VerificationComplete"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await waitFor(
			() => {
				const successMessage = canvas.getByText(/exchange completed successfully/i)
				expect(successMessage).toBeInTheDocument()
			},
			{ timeout: 2000 }
		)

		// Check that success icon is displayed
		const successIcon = canvas.getByTestId('success-icon')
		expect(successIcon).toBeInTheDocument()
	}}
>
	{@const exchange = verifyExchangeSetup.exchangeService.getExchangeData('verify-exchange-complete', 'verify')}
	{#await exchange then exchangeData}
		<InteractionPage
			exchangeService={verifyExchangeSetup.exchangeService}
			exchange={exchangeData}
		/>
	{/await}
</Story>

<Story
	name="VerificationInvalid"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await waitFor(
			() => {
				const errorDisplay = canvas.getByTestId('error-display')
				expect(errorDisplay).toBeInTheDocument()
			},
			{ timeout: 2000 }
		)
	}}
>
	{@const exchange = verifyExchangeSetup.exchangeService.getExchangeData('verify-exchange-invalid', 'verify')}
	{#await exchange then exchangeData}
		<InteractionPage
			exchangeService={verifyExchangeSetup.exchangeService}
			exchange={exchangeData}
		/>
	{/await}
</Story>

<!-- Claim Workflow Stories -->
<Story
	name="ClaimPending"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await waitFor(
			() => {
				const title = canvas.getByText(/claim your credential/i)
				expect(title).toBeInTheDocument()
			},
			{ timeout: 2000 }
		)

		// Check that credential preview is shown
		const credentialPreview = canvas.getByTestId('credential-preview')
		expect(credentialPreview).toBeInTheDocument()

		// Check that wallet selector is shown
		const walletSelector = canvas.getByTestId('interaction-page')
		expect(walletSelector).toBeInTheDocument()
	}}
>
	{@const exchange = claimExchangeSetup.exchangeService.getExchangeData('claim-exchange-123', 'claim')}
	{#await exchange then exchangeData}
		<InteractionPage
			exchangeService={claimExchangeSetup.exchangeService}
			exchange={exchangeData}
		/>
	{/await}
</Story>

<Story
	name="ClaimComplete"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await waitFor(
			() => {
				const successMessage = canvas.getByText(/exchange completed successfully/i)
				expect(successMessage).toBeInTheDocument()
			},
			{ timeout: 2000 }
		)

		// Check that success message mentions "issued"
		const issuedText = canvas.getByText(/your credential has been issued/i)
		expect(issuedText).toBeInTheDocument()
	}}
>
	{@const exchange = claimExchangeSetup.exchangeService.getExchangeData('claim-exchange-complete', 'claim')}
	{#await exchange then exchangeData}
		<InteractionPage
			exchangeService={claimExchangeSetup.exchangeService}
			exchange={exchangeData}
		/>
	{/await}
</Story>

<Story
	name="ClaimInvalid"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await waitFor(
			() => {
				const errorDisplay = canvas.getByTestId('error-display')
				expect(errorDisplay).toBeInTheDocument()
			},
			{ timeout: 2000 }
		)
	}}
>
	{@const exchange = claimExchangeSetup.exchangeService.getExchangeData('claim-exchange-invalid', 'claim')}
	{#await exchange then exchangeData}
		<InteractionPage
			exchangeService={claimExchangeSetup.exchangeService}
			exchange={exchangeData}
		/>
	{/await}
</Story>

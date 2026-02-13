<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, within, waitFor } from 'storybook/test'
	import {
		createStorybookClaimExchange,
		createStorybookVerifyExchange,
		createStorybookSetup
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

	// Exchange data for claim workflow
	const claimExchangePending = createStorybookClaimExchange({
		exchangeId: 'claim-exchange-123',
		state: 'pending'
	})
	const claimExchangeComplete = createStorybookClaimExchange({
		exchangeId: 'claim-exchange-complete',
		state: 'complete'
	})
	const claimExchangeInvalid = createStorybookClaimExchange({
		exchangeId: 'claim-exchange-invalid',
		state: 'invalid'
	})

	// Exchange data for verify workflow
	const verifyExchangePending = createStorybookVerifyExchange({
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
	})
	const verifyExchangeComplete = createStorybookVerifyExchange({
		exchangeId: 'verify-exchange-complete',
		state: 'complete',
		variables: {
			vprContext: ['https://www.w3.org/2018/credentials/v1'],
			vprCredentialType: ['VerifiableCredential']
		}
	})
	const verifyExchangeInvalid = createStorybookVerifyExchange({
		exchangeId: 'verify-exchange-invalid',
		state: 'invalid',
		variables: {
			vprContext: ['https://www.w3.org/2018/credentials/v1'],
			vprCredentialType: ['VerifiableCredential']
		}
	})

	// Create fake exchange clients for each story
	const verificationPendingClient = createStorybookSetup({
		'verify-exchange-123': verifyExchangePending
	}).exchangeClient

	const verificationCompleteClient = createStorybookSetup({
		'verify-exchange-complete': verifyExchangeComplete
	}).exchangeClient

	const verificationInvalidClient = createStorybookSetup({
		'verify-exchange-invalid': verifyExchangeInvalid
	}).exchangeClient

	const claimPendingClient = createStorybookSetup({
		'claim-exchange-123': claimExchangePending
	}).exchangeClient

	const claimCompleteClient = createStorybookSetup({
		'claim-exchange-complete': claimExchangeComplete
	}).exchangeClient

	const claimInvalidClient = createStorybookSetup({
		'claim-exchange-invalid': claimExchangeInvalid
	}).exchangeClient
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
	<InteractionPage exchange={verifyExchangePending} exchangeClient={verificationPendingClient} />
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
	<InteractionPage exchange={verifyExchangeComplete} exchangeClient={verificationCompleteClient} />
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
	<InteractionPage exchange={verifyExchangeInvalid} exchangeClient={verificationInvalidClient} />
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
	<InteractionPage exchange={claimExchangePending} exchangeClient={claimPendingClient} />
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
	<InteractionPage exchange={claimExchangeComplete} exchangeClient={claimCompleteClient} />
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
	<InteractionPage exchange={claimExchangeInvalid} exchangeClient={claimInvalidClient} />
</Story>

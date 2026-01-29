<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, within, userEvent, waitFor } from 'storybook/test'
	import {
		createStorybookSetup,
		createStorybookClaimExchange,
		createStorybookDidAuthExchange,
		createStorybookVerifyExchange
	} from '../../test-fixtures/storybook-helpers.js'

	import WalletSelector from './WalletSelector.svelte'

	const { Story } = defineMeta({
		title: 'Components/WalletSelector',
		argTypes: {
			exchangeId: {
				control: 'text',
				description: 'Exchange ID'
			},
			workflowId: {
				control: 'select',
				options: ['claim', 'didAuth', 'verify'],
				description: 'Workflow ID'
			},
			prefersSameDevice: {
				control: 'boolean',
				description: 'Prefer same device (overrides wallet preference)'
			},
			prefersOtherDevice: {
				control: 'boolean',
				description: 'Prefer other device (overrides wallet preference)'
			}
		},
		args: {}
	})

	// Setup for claim exchange (supports OID4VCI)
	const claimExchangeSetup = createStorybookSetup({
		'claim-exchange-123': createStorybookClaimExchange({
			exchangeId: 'claim-exchange-123',
			state: 'active'
		})
	})

	// Setup for verify exchange (supports OID4VP)
	const verifyExchangeSetup = createStorybookSetup({
		'verify-exchange-123': createStorybookVerifyExchange({
			exchangeId: 'verify-exchange-123',
			state: 'active'
		})
	})

	// Setup for didAuth exchange (supports OID4VP)
	const didAuthExchangeSetup = createStorybookSetup({
		'didauth-exchange-123': createStorybookDidAuthExchange({
			exchangeId: 'didauth-exchange-123',
			state: 'active'
		})
	})
</script>

<Story
	name="InitialState"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await waitFor(
			() => {
				const title = canvas.getByText(/select a wallet/i)
				expect(title).toBeInTheDocument()
			},
			{ timeout: 2000 }
		)

		// Check that wallet cards are displayed
		const walletCards = canvas.getAllByTestId(/^wallet-/)
		expect(walletCards.length).toBeGreaterThan(0)
	}}
>
	<WalletSelector
		exchangeId="claim-exchange-123"
		workflowId="claim"
		exchangeService={claimExchangeSetup.exchangeService}
	/>
</Story>

<Story
	name="WalletSelectedCrossDevice"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		
		// Wait for wallets to load (title appears when wallets are ready)
		await waitFor(
			() => {
				const title = canvas.getByText(/select a wallet/i)
				expect(title).toBeInTheDocument()
			},
			{ timeout: 2000 }
		)

		// Click on a wallet (prefer one that supports cross-device) - wait for specific wallet
		const walletCard = await waitFor(
			() => {
				const card = canvas.getByTestId('wallet-learncard')
				expect(card).toBeInTheDocument()
				return card
			},
			{ timeout: 2000 }
		)
		const walletButton = within(walletCard).getByRole('button')
		await userEvent.click(walletButton)

		// Wait for loading to complete (indicates async operation finished)
		await waitFor(
			() => {
				const loadingIndicator = canvasElement.querySelector('[role="status"]')
				expect(loadingIndicator).not.toBeInTheDocument()
			},
			{ timeout: 3000 }
		)

		// Wait for wallet selection to complete (back button appears)
		await waitFor(
			() => {
				const backButton = canvas.getByTestId('back-button')
				expect(backButton).toBeInTheDocument()
			},
			{ timeout: 2000 }
		)

		// Wait for invocation result to appear (loading completed)
		await waitFor(
			() => {
				const qrCode = canvas.queryByTestId('qr-code')
				const deepLink = canvas.queryByTestId('deep-link-button')
				expect(qrCode || deepLink).toBeInTheDocument()
			},
			{ timeout: 3000 }
		)

		// Verify it's specifically a QR code (cross-device)
		const qrCode = canvas.getByTestId('qr-code')
		expect(qrCode).toBeInTheDocument()

		// Verify instruction text
		const instruction = canvas.getByText(/scan this qr code/i)
		expect(instruction).toBeInTheDocument()
	}}
>
	<WalletSelector
		exchangeId="claim-exchange-123"
		workflowId="claim"
		exchangeService={claimExchangeSetup.exchangeService}
		prefersOtherDevice={true}
	/>
</Story>

<Story
	name="WalletSelectedSameDevice"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		
		// Wait for wallets to load (title appears when wallets are ready)
		await waitFor(
			() => {
				const title = canvas.getByText(/select a wallet/i)
				expect(title).toBeInTheDocument()
			},
			{ timeout: 2000 }
		)

		// Click on a wallet that prefers same device - wait for specific wallet
		const walletCard = await waitFor(
			() => {
				const card = canvas.getByTestId('wallet-asu-pocket')
				expect(card).toBeInTheDocument()
				return card
			},
			{ timeout: 2000 }
		)
		const walletButton = within(walletCard).getByRole('button')
		await userEvent.click(walletButton)

		// Wait for deep link button to appear
		await waitFor(
			() => {
				const deepLinkButton = canvas.getByTestId('deep-link-button')
				expect(deepLinkButton).toBeInTheDocument()
			},
			{ timeout: 3000 }
		)

		// Verify instruction text
		const instruction = canvas.getByText(/click the button below/i)
		expect(instruction).toBeInTheDocument()
	}}
>
	<WalletSelector
		exchangeId="claim-exchange-123"
		workflowId="claim"
		exchangeService={claimExchangeSetup.exchangeService}
		prefersSameDevice={true}
	/>
</Story>

<Story
	name="AdvancedProtocolSelection"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		
		// Wait for wallets to load (title appears when wallets are ready)
		await waitFor(
			() => {
				const title = canvas.getByText(/select a wallet/i)
				expect(title).toBeInTheDocument()
			},
			{ timeout: 2000 }
		)

		// Click on a wallet that supports multiple protocols - wait for specific wallet
		const walletCard = await waitFor(
			() => {
				const card = canvas.getByTestId('wallet-asu-pocket')
				expect(card).toBeInTheDocument()
				return card
			},
			{ timeout: 2000 }
		)
		const walletButton = within(walletCard).getByRole('button')
		await userEvent.click(walletButton)

		// Wait for loading to complete (indicates async operation finished)
		await waitFor(
			() => {
				const loadingIndicator = canvasElement.querySelector('[role="status"]')
				expect(loadingIndicator).not.toBeInTheDocument()
			},
			{ timeout: 3000 }
		)

		// Wait for wallet selection to complete (back button appears)
		await waitFor(
			() => {
				const backButton = canvas.getByTestId('back-button')
				expect(backButton).toBeInTheDocument()
			},
			{ timeout: 2000 }
		)

		// Toggle advanced protocol selection
		const advancedToggle = canvas.getByTestId('advanced-protocol-toggle')
		await userEvent.click(advancedToggle)

		// Wait for protocol options to appear
		await waitFor(
			() => {
				const protocolOptions = canvas.getAllByTestId(/^protocol-/)
				expect(protocolOptions.length).toBeGreaterThan(0)
			},
			{ timeout: 1000 }
		)

		// Select a different protocol
		const oid4vciProtocol = canvas.getByTestId('protocol-OID4VCI')
		await userEvent.click(oid4vciProtocol)

		// Wait for the selection to update
		await waitFor(
			() => {
				expect(oid4vciProtocol).toBeChecked()
			},
			{ timeout: 2000 }
		)
	}}
>
	<WalletSelector
		exchangeId="claim-exchange-123"
		workflowId="claim"
		exchangeService={claimExchangeSetup.exchangeService}
	/>
</Story>

<Story
	name="VerifyExchange"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		
		// Wait for wallets to load (title appears when wallets are ready)
		await waitFor(
			() => {
				const title = canvas.getByText(/select a wallet/i)
				expect(title).toBeInTheDocument()
			},
			{ timeout: 2000 }
		)

		// Verify exchange should show OID4VP compatible wallets - wait for specific wallet
		const walletCard = await waitFor(
			() => {
				const card = canvas.getByTestId('wallet-learncard')
				expect(card).toBeInTheDocument()
				return card
			},
			{ timeout: 2000 }
		)
		const walletButton = within(walletCard).getByRole('button')
		await userEvent.click(walletButton)

		// Wait for QR code or deep link to appear
		await waitFor(
			() => {
				const qrCode = canvas.queryByTestId('qr-code')
				const deepLink = canvas.queryByTestId('deep-link-button')
				expect(qrCode || deepLink).toBeInTheDocument()
			},
			{ timeout: 3000 }
		)
	}}
>
	<WalletSelector
		exchangeId="verify-exchange-123"
		workflowId="verify"
		exchangeService={verifyExchangeSetup.exchangeService}
	/>
</Story>

<Story
	name="BackButton"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		
		// Wait for wallets to load (title appears when wallets are ready)
		await waitFor(
			() => {
				const title = canvas.getByText(/select a wallet/i)
				expect(title).toBeInTheDocument()
			},
			{ timeout: 2000 }
		)

		// Select a wallet - wait for the specific wallet to appear
		const walletCard = await waitFor(
			() => {
				const card = canvas.getByTestId('wallet-learncard')
				expect(card).toBeInTheDocument()
				return card
			},
			{ timeout: 2000 }
		)
		const walletButton = within(walletCard).getByRole('button')
		await userEvent.click(walletButton)

		// Wait for loading to complete (indicates async operation finished)
		await waitFor(
			() => {
				const loadingIndicator = canvasElement.querySelector('[role="status"]')
				expect(loadingIndicator).not.toBeInTheDocument()
			},
			{ timeout: 3000 }
		)

		// Wait for selection to complete (back button appears)
		await waitFor(
			() => {
				const backButton = canvas.getByTestId('back-button')
				expect(backButton).toBeInTheDocument()
			},
			{ timeout: 2000 }
		)

		// Click back button
		const backButton = canvas.getByTestId('back-button')
		await userEvent.click(backButton)

		// Verify we're back to wallet selection
		await waitFor(
			() => {
				const title = canvas.getByText(/select a wallet/i)
				expect(title).toBeInTheDocument()
			},
			{ timeout: 1000 }
		)
	}}
>
	<WalletSelector
		exchangeId="claim-exchange-123"
		workflowId="claim"
		exchangeService={claimExchangeSetup.exchangeService}
	/>
</Story>

<script lang="ts">
	import type { ExchangeService } from '../../services/exchange-service.js'
	import type { WalletConfig, ProtocolType } from '../../wallets/wallet-config.js'
	import {
		getCompatibleWallets,
		createWalletSelection,
		shouldShowAdvancedProtocolSelection,
		getAvailableProtocolsFromExchange,
		type WalletSelection
	} from '../../wallets/wallet-selector.js'
	import { generateInvocation } from '../../wallets/wallet-invocation.js'
	import LoadingIndicator from '../loading-indicator/LoadingIndicator.svelte'
	import ErrorDisplay from '../error-display/ErrorDisplay.svelte'

	interface Props {
		/** Exchange service instance (dependency injection) */
		exchangeService: ExchangeService
		/** Exchange ID */
		exchangeId: string
		/** Workflow ID */
		workflowId: App.SupportedWorkflowIds
		/** Whether to prefer same device (overrides wallet preference) */
		prefersSameDevice?: boolean
		/** Whether to prefer other device (overrides wallet preference) */
		prefersOtherDevice?: boolean
	}

	let {
		exchangeService,
		exchangeId,
		workflowId,
		prefersSameDevice: propPrefersSameDevice,
		prefersOtherDevice: propPrefersOtherDevice
	}: Props = $props()

	let compatibleWallets = $state<WalletConfig[]>([])
	let selectedWalletId = $state<string | null>(null)
	let selectedProtocol = $state<ProtocolType | null>(null)
	let showAdvancedProtocols = $state(false)
	let walletSelection = $state<WalletSelection | null>(null)
	let invocationResult = $state<{
		qrCodeDataUrl?: string
		deepLinkUrl?: string
		url?: string
	} | null>(null)
	let loading = $state(false)
	let error = $state<Error | null>(null)

	// Determine device preference
	const prefersSameDevice = propPrefersSameDevice
		? true
		: propPrefersOtherDevice
			? false
			: undefined

	async function loadExchangeProtocols() {
		loading = true
		error = null

		try {
			const exchange = await exchangeService.getExchangeData(
				exchangeId,
				workflowId
			)
			const protocols = exchangeService.getExchangeProtocols(exchange)
			const availableProtocols = getAvailableProtocolsFromExchange(protocols)
			compatibleWallets = getCompatibleWallets(availableProtocols)
		} catch (e) {
			error = e instanceof Error ? e : new Error(String(e))
		} finally {
			loading = false
		}
	}

	async function selectWallet(walletId: string) {
		loading = true
		error = null

		try {
			const exchange = await exchangeService.getExchangeData(
				exchangeId,
				workflowId
			)
			const protocols = exchangeService.getExchangeProtocols(exchange)
			const availableProtocols = getAvailableProtocolsFromExchange(protocols)

			const selection = createWalletSelection(
				walletId,
				availableProtocols,
				selectedProtocol || undefined
			)

			if (!selection) {
				error = new Error('Wallet selection failed')
				return
			}

			walletSelection = selection
			selectedWalletId = walletId
			selectedProtocol = selection.selectedProtocol

			// Find the available protocol object for the selected protocol
			const availableProtocol = availableProtocols.find(
				(p) => p.type === selection.selectedProtocol
			)

			if (availableProtocol) {
				const result = await generateInvocation(
					selection.wallet,
					selection.selectedProtocol,
					availableProtocol,
					prefersSameDevice
				)
				invocationResult = result
			}
		} catch (e) {
			error = e instanceof Error ? e : new Error(String(e))
		} finally {
			loading = false
		}
	}

	function handleProtocolChange(protocol: ProtocolType) {
		selectedProtocol = protocol
		if (selectedWalletId) {
			selectWallet(selectedWalletId)
		}
	}

	function resetSelection() {
		selectedWalletId = null
		selectedProtocol = null
		walletSelection = null
		invocationResult = null
		showAdvancedProtocols = false
	}

	// Load wallets on mount
	$effect(() => {
		exchangeId
		workflowId
		loadExchangeProtocols()
	})
</script>

<div class="wallet-selector">
	{#if error}
		<ErrorDisplay {error} />
	{:else if loading && compatibleWallets.length === 0}
		<LoadingIndicator loading={true} delay={0} />
	{:else if compatibleWallets.length === 0}
		<div class="no-wallets">No compatible wallets found for this exchange.</div>
	{:else if !selectedWalletId}
		<!-- Wallet Selection -->
		<div class="wallet-list">
			<h3 class="section-title">Select a Wallet</h3>
			<div class="wallet-cards">
				{#each compatibleWallets as wallet (wallet.id)}
					<button
						type="button"
						class="wallet-card"
						onclick={() => selectWallet(wallet.id)}
						data-testid={`wallet-${wallet.id}`}
					>
						<div class="wallet-info">
							<h4 class="wallet-name">{wallet.name}</h4>
							<p class="wallet-description">{wallet.description}</p>
						</div>
					</button>
				{/each}
			</div>
		</div>
	{:else if walletSelection}
		<!-- Wallet Selected -->
		<div class="wallet-selected">
			<div class="selected-wallet-header">
				<button
					type="button"
					class="back-button"
					onclick={resetSelection}
					data-testid="back-button"
				>
					← Back
				</button>
				<h3 class="section-title">{walletSelection.wallet.name}</h3>
			</div>

			{#if shouldShowAdvancedProtocolSelection(
				walletSelection.wallet,
				walletSelection.availableProtocols
			)}
				<div class="protocol-selection">
					<label class="protocol-label">
						<input
							type="checkbox"
							bind:checked={showAdvancedProtocols}
							data-testid="advanced-protocol-toggle"
						/>
						Show protocol options
					</label>

					{#if showAdvancedProtocols}
						<div class="protocol-options">
							{#each walletSelection.availableProtocols as protocol}
								<label class="protocol-option">
									<input
										type="radio"
										name="protocol"
										value={protocol.type}
										checked={selectedProtocol === protocol.type}
										onchange={() => handleProtocolChange(protocol.type)}
										data-testid={`protocol-${protocol.type}`}
									/>
									{protocol.type}
								</label>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			{#if loading}
				<LoadingIndicator loading={true} delay={0} />
			{:else if invocationResult}
				<div class="invocation-result">
					{#if invocationResult.qrCodeDataUrl}
						<!-- Cross-device: Show QR Code -->
						<div class="qr-code-container">
							<p class="instruction-text">
								Scan this QR code with your wallet to continue:
							</p>
							<img
								src={invocationResult.qrCodeDataUrl}
								alt="QR Code for wallet invocation"
								class="qr-code"
								data-testid="qr-code"
							/>
						</div>
					{:else if invocationResult.deepLinkUrl}
						<!-- Same-device: Show Deep Link Button -->
						<div class="deep-link-container">
							<p class="instruction-text">
								Click the button below to open your wallet:
							</p>
							<a
								href={invocationResult.deepLinkUrl}
								class="deep-link-button"
								data-testid="deep-link-button"
							>
								Open {walletSelection.wallet.name}
							</a>
						</div>
					{:else if invocationResult.url}
						<!-- Fallback: Show URL -->
						<div class="url-container">
							<p class="instruction-text">Use this URL:</p>
							<code class="url-text" data-testid="url-text">{invocationResult.url}</code>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.wallet-selector {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 1rem;
	}

	.section-title {
		margin: 0 0 1rem 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: #111827;
	}

	.wallet-list {
		width: 100%;
	}

	.wallet-cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 1rem;
	}

	.wallet-card {
		padding: 1.5rem;
		border: 2px solid #e5e7eb;
		border-radius: 0.5rem;
		background: white;
		cursor: pointer;
		text-align: left;
		transition: all 0.2s;
	}

	.wallet-card:hover {
		border-color: #3b82f6;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}

	.wallet-card:focus {
		outline: 2px solid #3b82f6;
		outline-offset: 2px;
	}

	.wallet-info {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.wallet-name {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: #111827;
	}

	.wallet-description {
		margin: 0;
		font-size: 0.875rem;
		color: #6b7280;
	}

	.wallet-selected {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.selected-wallet-header {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.back-button {
		padding: 0.5rem 1rem;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		background: white;
		color: #374151;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.back-button:hover {
		background: #f9fafb;
		border-color: #9ca3af;
	}

	.protocol-selection {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		background: #f9fafb;
		border-radius: 0.5rem;
	}

	.protocol-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: #374151;
		cursor: pointer;
	}

	.protocol-options {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-left: 1.5rem;
	}

	.protocol-option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: #374151;
		cursor: pointer;
	}

	.invocation-result {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 2rem;
		background: #f9fafb;
		border-radius: 0.5rem;
	}

	.instruction-text {
		margin: 0;
		font-size: 1rem;
		color: #374151;
		text-align: center;
	}

	.qr-code-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.qr-code {
		width: 300px;
		height: 300px;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		background: white;
		padding: 1rem;
	}

	.deep-link-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.deep-link-button {
		padding: 0.75rem 2rem;
		background: #3b82f6;
		color: white;
		border-radius: 0.5rem;
		text-decoration: none;
		font-weight: 500;
		font-size: 1rem;
		transition: background-color 0.2s;
	}

	.deep-link-button:hover {
		background: #2563eb;
	}

	.url-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.url-text {
		padding: 0.75rem 1rem;
		background: white;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		font-family: monospace;
		font-size: 0.875rem;
		color: #111827;
		word-break: break-all;
		max-width: 100%;
	}

	.no-wallets {
		padding: 2rem;
		text-align: center;
		color: #6b7280;
		font-size: 1rem;
	}
</style>

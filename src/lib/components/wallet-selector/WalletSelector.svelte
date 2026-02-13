<script lang="ts">
  import type {
    WalletConfig,
    ProtocolType
  } from '../../wallets/wallet-config.js'
  import {
    getCompatibleWallets,
    createWalletSelection,
    shouldShowAdvancedProtocolSelection,
    getAvailableProtocolsFromExchange,
    type WalletSelection
  } from '../../wallets/wallet-selector.js'
  import { generateInvocation } from '../../wallets/wallet-invocation.js'
  import { getExchangeProtocols } from '../../exchange/exchange-utils.js'
  import LoadingIndicator from '../loading-indicator/LoadingIndicator.svelte'
  import ErrorDisplay from '../error-display/ErrorDisplay.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
  } from '$lib/components/ui/card/index.js'
  import { Label } from '$lib/components/ui/label/index.js'

  interface Props {
    /** Exchange data */
    exchange: App.ExchangeDetailBase
    /** Whether to prefer same device (overrides wallet preference) */
    prefersSameDevice?: boolean
    /** Whether to prefer other device (overrides wallet preference) */
    prefersOtherDevice?: boolean
  }

  let {
    exchange,
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
  const prefersSameDevice = $derived(
    propPrefersSameDevice ? true : propPrefersOtherDevice ? false : undefined
  )

  function loadExchangeProtocols() {
    loading = true
    error = null

    try {
      const protocols = getExchangeProtocols(exchange)
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
      const protocols = getExchangeProtocols(exchange)
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

  // Load wallets when exchange changes
  $effect(() => {
    exchange
    loadExchangeProtocols()
  })
</script>

<div class="flex flex-col gap-6 p-4">
  {#if error}
    <ErrorDisplay {error} />
  {:else if loading && compatibleWallets.length === 0}
    <LoadingIndicator loading={true} delay={0} />
  {:else if compatibleWallets.length === 0}
    <div class="py-8 text-center text-muted-foreground">
      No compatible wallets found for this exchange.
    </div>
  {:else if !selectedWalletId}
    <!-- Wallet Selection -->
    <div class="w-full">
      <h3 class="mb-4 text-xl font-semibold text-foreground">
        Select a Wallet
      </h3>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
        {#each compatibleWallets as wallet (wallet.id)}
          <Card
            class="cursor-pointer transition-all hover:border-primary hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
            data-testid={`wallet-${wallet.id}`}
          >
            <button
              type="button"
              class="w-full text-left"
              onclick={() => selectWallet(wallet.id)}
            >
              <CardHeader>
                <CardTitle class="text-lg font-semibold text-foreground"
                  >{wallet.name}</CardTitle
                >
                <CardDescription class="text-sm text-muted-foreground"
                  >{wallet.description}</CardDescription
                >
              </CardHeader>
            </button>
          </Card>
        {/each}
      </div>
    </div>
  {:else if walletSelection}
    <!-- Wallet Selected -->
    <div class="flex flex-col gap-4">
      <div class="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          type="button"
          onclick={resetSelection}
          data-testid="back-button"
        >
          ← Back
        </Button>
        <h3 class="text-xl font-semibold text-foreground">
          {walletSelection.wallet.name}
        </h3>
      </div>

      {#if shouldShowAdvancedProtocolSelection(walletSelection.wallet, walletSelection.availableProtocols)}
        <Card>
          <CardContent class="p-4">
            <div class="flex flex-col gap-3">
              <Label
                class="flex cursor-pointer items-center gap-2 text-sm text-foreground"
              >
                <input
                  type="checkbox"
                  bind:checked={showAdvancedProtocols}
                  data-testid="advanced-protocol-toggle"
                  class="h-4 w-4 rounded border-input"
                />
                Show protocol options
              </Label>

              {#if showAdvancedProtocols}
                <div class="ml-6 flex flex-col gap-2">
                  {#each walletSelection.availableProtocols as protocol (protocol.type)}
                    <Label
                      class="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                    >
                      <input
                        type="radio"
                        name="protocol"
                        value={protocol.type}
                        checked={selectedProtocol === protocol.type}
                        onchange={() => handleProtocolChange(protocol.type)}
                        data-testid={`protocol-${protocol.type}`}
                        class="h-4 w-4 border-input"
                      />
                      {protocol.type}
                    </Label>
                  {/each}
                </div>
              {/if}
            </div>
          </CardContent>
        </Card>
      {/if}

      {#if loading}
        <LoadingIndicator loading={true} delay={0} />
      {:else if invocationResult}
        <Card>
          <CardContent class="flex flex-col items-center gap-4 p-8">
            {#if invocationResult.qrCodeDataUrl}
              <!-- Cross-device: Show QR Code -->
              <div class="flex flex-col items-center gap-4">
                <p class="m-0 text-center text-foreground">
                  Scan this QR code with your wallet to continue:
                </p>
                <img
                  src={invocationResult.qrCodeDataUrl}
                  alt="QR Code for wallet invocation"
                  class="h-[300px] w-[300px] rounded-lg border border-border bg-background p-4"
                  data-testid="qr-code"
                />
              </div>
            {:else if invocationResult.deepLinkUrl}
              <!-- Same-device: Show Deep Link Button -->
              <div class="flex flex-col items-center gap-4">
                <p class="m-0 text-center text-foreground">
                  Click the button below to open your wallet:
                </p>
                <!-- eslint-disable svelte/no-navigation-without-resolve -->
                <a
                  href={invocationResult.deepLinkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="deep-link-button"
                >
                  <Button size="lg">
                    Open {walletSelection.wallet.name}
                  </Button>
                </a>
                <!-- eslint-enable svelte/no-navigation-without-resolve -->
              </div>
            {:else if invocationResult.url}
              <!-- Fallback: Show URL -->
              <div class="flex flex-col items-center gap-2">
                <p class="m-0 text-foreground">Use this URL:</p>
                <code
                  class="max-w-full break-all rounded-md border border-border bg-background px-4 py-3 font-mono text-sm text-foreground"
                  data-testid="url-text">{invocationResult.url}</code
                >
              </div>
            {/if}
          </CardContent>
        </Card>
      {/if}
    </div>
  {/if}
</div>

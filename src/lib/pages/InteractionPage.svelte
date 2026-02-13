<script lang="ts">
  import WalletSelector from '../components/wallet-selector/WalletSelector.svelte'
  import ExchangeStatusPoll from '../components/exchange-status/ExchangeStatusPoll.svelte'
  import CredentialPreview from '../components/credential-preview/CredentialPreview.svelte'
  import ErrorDisplay from '../components/error-display/ErrorDisplay.svelte'
  import type { ExchangeClient } from '../services/ui/exchange-client.js'
  import { HttpExchangeClient } from '../services/ui/exchange-client.js'
  import { getVerificationUIContent } from '../workflows/ui/verification-ui.js'
  import { getClaimUIContent } from '../workflows/ui/claim-ui.js'
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
  } from '$lib/components/ui/card/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'

  interface Props {
    /** Exchange data */
    exchange: App.ExchangeDetailBase
    /** Exchange client instance (optional, defaults to new HttpExchangeClient) */
    exchangeClient?: ExchangeClient
    /** Polling interval in milliseconds (default: 3000) */
    pollInterval?: number
    /** Maximum number of polls before pausing (default: 40) */
    maxPolls?: number
  }

  let {
    exchange,
    exchangeClient = new HttpExchangeClient(),
    pollInterval = 3000,
    maxPolls = 40
  }: Props = $props()

  // Reactive exchange state initialized from prop
  // svelte-ignore state_referenced_locally
  let currentExchange = $state(exchange)

  // Polling state
  let isPolling = $state(false)
  let statusCheckCount = $state(0)
  let isPaused = $state(false)
  let pollingIntervalId: ReturnType<typeof setInterval> | null = null

  // Error state
  let error = $state<Error | { message?: string; status?: number } | null>(null)

  // Track exchange ID to prevent unnecessary restarts
  // svelte-ignore state_referenced_locally
  let lastExchangeId = $state(exchange.exchangeId)

  // Poll request callback - fetches exchange state and updates reactive state
  async function onPollRequest(): Promise<App.ExchangeDetailBase> {
    if (isPolling || isPaused) {
      return currentExchange
    }

    // Stop if we've reached max polls
    if (statusCheckCount >= maxPolls) {
      isPaused = true
      stopPolling()
      return currentExchange
    }

    // Stop if exchange is complete or invalid
    if (
      currentExchange.state === 'complete' ||
      currentExchange.state === 'invalid'
    ) {
      stopPolling()
      return currentExchange
    }

    isPolling = true

    try {
      const result = await exchangeClient.getExchangeState(
        currentExchange.exchangeId,
        currentExchange.workflowId
      )
      // Only update if state actually changed - use Object.assign to avoid new object reference
      const stateChanged = result.state !== currentExchange.state
      Object.assign(currentExchange, result)
      if (stateChanged) {
        // Trigger reactivity for state change by creating new object reference
        currentExchange = { ...currentExchange }
      }
      statusCheckCount++
      error = null // Clear error on successful fetch
      return currentExchange
    } catch (e) {
      // Handle error via error callback
      onError(e)
      stopPolling() // Stop polling on error
      return currentExchange
    } finally {
      isPolling = false
    }
  }

  function startPolling() {
    if (pollingIntervalId) {
      return
    }

    // Only poll if exchange is pending or active
    if (
      currentExchange.state !== 'pending' &&
      currentExchange.state !== 'active'
    ) {
      return
    }

    // Defer initial check to avoid synchronous execution during effect
    queueMicrotask(() => {
      onPollRequest()
    })

    // Set up interval
    pollingIntervalId = setInterval(() => {
      onPollRequest()
    }, pollInterval)
  }

  function stopPolling() {
    if (pollingIntervalId) {
      clearInterval(pollingIntervalId)
      pollingIntervalId = null
    }
  }

  function resumePolling() {
    isPaused = false
    statusCheckCount = 0
    error = null // Clear error when resuming
    startPolling()
  }

  // Error handler - updates error state
  function onError(e: unknown) {
    // Extract error information
    if (e instanceof Error) {
      // Check if error has status property (from HttpExchangeClient or other sources)
      const errorWithStatus = e as Error & { status?: number }
      if (errorWithStatus.status !== undefined) {
        error = { message: e.message, status: errorWithStatus.status }
        return
      }

      // Extract status from error message if possible
      const message = e.message.toLowerCase()
      let status: number | undefined
      if (message.includes('not found') || message.includes('404')) {
        status = 404
      } else if (message.includes('unauthorized') || message.includes('401')) {
        status = 401
      } else if (
        message.includes('failed to fetch') ||
        message.includes('network')
      ) {
        // Network errors don't have HTTP status codes
        status = undefined
      }

      if (status !== undefined) {
        error = { message: e.message, status }
      } else {
        error = e
      }
    } else if (typeof e === 'object' && e !== null) {
      error = e as { message?: string; status?: number }
    } else {
      error = { message: String(e) }
    }
  }

  // Update currentExchange when prop changes (only when prop actually changes)
  $effect(() => {
    // Only update if the exchange ID changed (not on every render)
    if (exchange.exchangeId !== lastExchangeId) {
      currentExchange = exchange
      lastExchangeId = exchange.exchangeId
      error = null // Clear error when exchange prop changes
      // Reset polling state when exchange changes
      stopPolling()
      isPaused = false
      statusCheckCount = 0
    }
  })

  // Track previous state to detect actual changes
  // svelte-ignore state_referenced_locally
  let previousState = $state(currentExchange.state)

  // Manage polling lifecycle - only react to actual state changes
  $effect(() => {
    // Track exchange state value
    const exchangeState = currentExchange.state
    pollInterval
    maxPolls

    // Only restart if state actually changed
    const stateChanged = exchangeState !== previousState
    previousState = exchangeState

    // Check if we should poll
    const shouldPoll = exchangeState === 'pending' || exchangeState === 'active'
    const currentlyPolling = pollingIntervalId !== null

    // If state didn't change and we're already polling the correct state, don't restart
    if (!stateChanged && currentlyPolling && shouldPoll) {
      return
    }

    // Stop any existing polling
    stopPolling()

    // Reset pause state and error when exchange state changes
    if (stateChanged) {
      isPaused = false
      statusCheckCount = 0
      error = null
    }

    // Start polling if exchange is pending or active
    if (shouldPoll) {
      startPolling()
    }

    return () => {
      stopPolling()
    }
  })

  // Parse credential template for claim workflows
  const credentialData = $derived.by(() => {
    if (currentExchange.workflowId === 'claim') {
      try {
        const claimExchange = currentExchange as App.ExchangeDetailClaim
        return JSON.parse(claimExchange.variables.vc)
      } catch {
        return null
      }
    }
    return null
  })

  // Get workflow-specific UI content
  const verificationContent = $derived.by(() => {
    if (currentExchange.workflowId === 'verify') {
      return getVerificationUIContent(
        currentExchange as App.ExchangeDetailVerify
      )
    }
    return null
  })

  const claimContent = $derived.by(() => {
    if (currentExchange.workflowId === 'claim') {
      return getClaimUIContent(currentExchange as App.ExchangeDetailClaim)
    }
    return null
  })
</script>

<div
  class="container mx-auto max-w-4xl px-4 py-8"
  data-testid="interaction-page"
>
  {#if verificationContent}
    <!-- Verification Workflow UI -->
    <Card class="mb-6">
      <CardHeader>
        <CardTitle>{verificationContent.title}</CardTitle>
        <CardDescription>{verificationContent.description}</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        {#if verificationContent.credentialTypes.length > 0}
          <div class="flex flex-col gap-2">
            <p class="text-sm font-medium text-foreground">
              Required Credential Types:
            </p>
            <div class="flex flex-wrap gap-2">
              {#each verificationContent.credentialTypes as type}
                <Badge variant="secondary" data-testid="credential-type-{type}">
                  {type}
                </Badge>
              {/each}
            </div>
          </div>
        {/if}

        {#if verificationContent.claims && verificationContent.claims.length > 0}
          <div class="flex flex-col gap-2">
            <p class="text-sm font-medium text-foreground">Required Claims:</p>
            <ul class="list-inside list-disc text-sm text-muted-foreground">
              {#each verificationContent.claims as claim}
                <li>
                  {claim.path.join('.')}
                  {#if claim.values && claim.values.length > 0}
                    <span class="text-muted-foreground">
                      (one of: {claim.values.join(', ')})
                    </span>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if verificationContent.trustedIssuers && verificationContent.trustedIssuers.length > 0}
          <div class="flex flex-col gap-2">
            <p class="text-sm font-medium text-foreground">Trusted Issuers:</p>
            <ul class="list-inside list-disc text-sm text-muted-foreground">
              {#each verificationContent.trustedIssuers as issuer}
                <li>{issuer}</li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if verificationContent.trustedRegistries && verificationContent.trustedRegistries.length > 0}
          <div class="flex flex-col gap-2">
            <p class="text-sm font-medium text-foreground">
              Trusted Registries:
            </p>
            <ul class="list-inside list-disc text-sm text-muted-foreground">
              {#each verificationContent.trustedRegistries as registry}
                <li>{registry}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </CardContent>
    </Card>
  {:else if claimContent}
    <!-- Claim Workflow UI -->
    <Card class="mb-6">
      <CardHeader>
        <CardTitle>{claimContent.title}</CardTitle>
        <CardDescription>{claimContent.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {#if credentialData}
          <CredentialPreview credential={credentialData} />
        {:else}
          <div class="py-4 text-center text-sm text-muted-foreground">
            Unable to parse credential template
          </div>
        {/if}
      </CardContent>
    </Card>
  {/if}

  {#if error}
    <!-- Error Display -->
    <ErrorDisplay {error} />
  {:else if currentExchange.state === 'invalid'}
    <ErrorDisplay exchangeState="invalid" />
  {:else if currentExchange.state === 'complete'}
    <Card
      class="mb-6 border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
    >
      <CardContent class="p-6">
        <div class="flex items-center gap-3">
          <svg
            class="h-6 w-6 text-green-600 dark:text-green-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            data-testid="success-icon"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 13l4 4L19 7"
            />
          </svg>
          <div>
            <p class="m-0 font-semibold text-green-900 dark:text-green-100">
              Exchange completed successfully
            </p>
            <p class="m-0 mt-1 text-sm text-green-700 dark:text-green-300">
              Your credential has been {currentExchange.workflowId === 'claim'
                ? 'issued'
                : 'verified'}.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  {:else if currentExchange.state === 'pending' || currentExchange.state === 'active'}
    <!-- Wallet Selector and Status Poll -->
    <WalletSelector exchange={currentExchange} />
    {#if !error}
      <ExchangeStatusPoll
        exchange={currentExchange}
        {onPollRequest}
        {isPolling}
        {statusCheckCount}
        {isPaused}
        {maxPolls}
        onResumePolling={resumePolling}
      />
    {/if}
  {/if}
</div>

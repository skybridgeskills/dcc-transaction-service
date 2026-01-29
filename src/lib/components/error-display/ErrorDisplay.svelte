<script lang="ts">
	interface Props {
		/** Exchange state - if 'invalid', shows exchange invalid error */
		exchangeState?: App.ExchangeState
		/** Error object from API call */
		error?: Error | { message?: string; status?: number }
		/** Custom error message */
		message?: string
	}

	let { exchangeState, error, message }: Props = $props()

	function getErrorMessage(
		message?: string,
		error?: Error | { message?: string; status?: number },
		exchangeState?: App.ExchangeState): string {
		// Exchange invalid state
		if (exchangeState === 'invalid') {
			return 'This exchange is no longer valid. Please start a new exchange.'
		}

		// Custom message takes precedence
		if (message) {
			return message
		}

		// Error object with status code
		if (error && typeof error === 'object' && 'status' in error) {
			const status = error.status
			if (status === 404) {
				return 'Exchange not found. The exchange may have expired or been deleted.'
			}
			if (status === 401) {
				return 'Authentication failed. Please try again.'
			}
			if (status === 500) {
				return 'Server error. Please try again later.'
			}
			if (status && status >= 500) {
				return 'Server error. Please try again later.'
			}
			if (status && status >= 400) {
				return 'Request error. Please check your input and try again.'
			}
		}

		// Error instance
		if (error instanceof Error) {
			const errorMessageLower = error.message.toLowerCase()
			// Network/timeout errors
			if (errorMessageLower.includes('network') || errorMessageLower.includes('fetch')) {
				return 'Network error. Please check your connection and try again.'
			}
			if (errorMessageLower.includes('timeout')) {
				return 'Request timed out. Please try again.'
			}
			return error.message || 'An error occurred'
		}

		// Error object with message
		if (error && typeof error === 'object' && 'message' in error) {
			return error.message || 'An error occurred'
		}

		// Default
		return 'An unexpected error occurred. Please try again.'
	}

	const displayMessage = $derived(getErrorMessage(message, error, exchangeState))
</script>

<div class="error-display" role="alert">
	<div class="error-icon">⚠️</div>
	<div class="error-message">{displayMessage}</div>
</div>

<style>
	.error-display {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 1rem;
		background-color: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 0.375rem;
		color: #991b1b;
	}

	.error-icon {
		font-size: 1.25rem;
		line-height: 1;
		flex-shrink: 0;
	}

	.error-message {
		flex: 1;
		font-size: 0.875rem;
		line-height: 1.5;
	}
</style>

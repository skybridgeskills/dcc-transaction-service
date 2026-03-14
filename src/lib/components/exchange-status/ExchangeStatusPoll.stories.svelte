<script lang="ts" module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import { expect, within, userEvent, waitFor } from 'storybook/test'
  import { createStorybookClaimExchange } from '../../test-fixtures/storybook-helpers.js'

  import ExchangeStatusPoll from './ExchangeStatusPoll.svelte'

  const { Story } = defineMeta({
    title: 'Components/ExchangeStatusPoll',
    argTypes: {
      maxPolls: {
        control: 'number',
        description: 'Maximum number of polls before pausing (default: 40)'
      }
    },
    args: {}
  })

  // Exchange data for each story
  const activeExchange = createStorybookClaimExchange({
    exchangeId: 'test-exchange-123',
    state: 'active'
  })

  const completeExchange = createStorybookClaimExchange({
    exchangeId: 'test-exchange-complete',
    state: 'complete'
  })

  const invalidExchange = createStorybookClaimExchange({
    exchangeId: 'test-exchange-invalid',
    state: 'invalid'
  })

  const pausedExchange = createStorybookClaimExchange({
    exchangeId: 'test-exchange-paused',
    state: 'active'
  })

  // Mock callback that returns the exchange
  function mockOnPollRequest(exchange: App.ExchangeDetailBase) {
    return async () => exchange
  }

  // Mock resume callback
  let mockResumeCalled = false
  function mockResumePolling() {
    mockResumeCalled = true
  }
</script>

<Story
  name="ActivePolling"
  play={async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(
      () => {
        const statusBadge = canvas.getByText(/status: active/i)
        expect(statusBadge).toBeInTheDocument()
      },
      { timeout: 2000 }
    )
  }}
>
  <ExchangeStatusPoll
    exchange={activeExchange}
    onPollRequest={mockOnPollRequest(activeExchange)}
    isPolling={false}
    statusCheckCount={3}
    isPaused={false}
    maxPolls={5}
  />
</Story>

<Story
  name="CompleteState"
  play={async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(
      () => {
        const completeMessage = canvas.getByText(/exchange completed/i)
        expect(completeMessage).toBeInTheDocument()
      },
      { timeout: 2000 }
    )
  }}
>
  <ExchangeStatusPoll
    exchange={completeExchange}
    onPollRequest={mockOnPollRequest(completeExchange)}
    isPolling={false}
    statusCheckCount={10}
    isPaused={false}
  />
</Story>

<Story
  name="InvalidState"
  play={async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(
      () => {
        const errorDisplay = canvas.getByRole('alert')
        expect(errorDisplay).toBeInTheDocument()
        expect(errorDisplay).toHaveTextContent(/no longer valid/i)
      },
      { timeout: 2000 }
    )
  }}
>
  <ExchangeStatusPoll
    exchange={invalidExchange}
    onPollRequest={mockOnPollRequest(invalidExchange)}
    isPolling={false}
    statusCheckCount={5}
    isPaused={false}
  />
</Story>

<Story
  name="PausedAfterMaxPolls"
  play={async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(
      () => {
        // Verify resume button is present (replaces progress bar when paused)
        const resumeButton = canvas.getByRole('button', { name: /resume/i })
        expect(resumeButton).toBeInTheDocument()
        // Verify status badge is still visible
        const statusBadge = canvas.getByText(/status: active/i)
        expect(statusBadge).toBeInTheDocument()
      },
      { timeout: 2000 }
    )

    const resumeButton = canvas.getByRole('button', { name: /resume/i })
    await userEvent.click(resumeButton)

    await waitFor(
      () => {
        const statusBadge = canvas.getByText(/status: active/i)
        expect(statusBadge).toBeInTheDocument()
      },
      { timeout: 500 }
    )
  }}
>
  <ExchangeStatusPoll
    exchange={pausedExchange}
    onPollRequest={mockOnPollRequest(pausedExchange)}
    isPolling={false}
    statusCheckCount={3}
    isPaused={true}
    maxPolls={3}
    onResumePolling={mockResumePolling}
  />
</Story>

<Story
  name="PollingInProgress"
  play={async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(
      () => {
        const loadingIndicator = canvasElement.querySelector('[role="status"]')
        expect(loadingIndicator).toBeInTheDocument()
      },
      { timeout: 1000 }
    )
  }}
>
  <ExchangeStatusPoll
    exchange={activeExchange}
    onPollRequest={mockOnPollRequest(activeExchange)}
    isPolling={true}
    statusCheckCount={2}
    isPaused={false}
    maxPolls={5}
  />
</Story>

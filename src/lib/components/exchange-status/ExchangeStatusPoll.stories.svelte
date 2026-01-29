<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, within, userEvent, waitFor } from 'storybook/test'
	import {
		createStorybookSetup,
		createStorybookClaimExchange
	} from '../../test-fixtures/storybook-helpers.js'

	import ExchangeStatusPoll from './ExchangeStatusPoll.svelte'

	const { Story } = defineMeta({
		title: 'Components/ExchangeStatusPoll',
		argTypes: {
			exchangeId: {
				control: 'text',
				description: 'Exchange ID to poll'
			},
			workflowId: {
				control: 'select',
				options: ['claim', 'didAuth', 'verify'],
				description: 'Workflow ID'
			},
			pollInterval: {
				control: 'number',
				description: 'Polling interval in milliseconds (default: 3000)'
			},
			maxPolls: {
				control: 'number',
				description: 'Maximum number of polls before pausing (default: 40)'
			}
		},
		args: {}
	})

	// Setup services for each story
	const activeExchangeSetup = createStorybookSetup({
		'test-exchange-123': createStorybookClaimExchange({
			exchangeId: 'test-exchange-123',
			state: 'active'
		})
	})

	const completeExchangeSetup = createStorybookSetup({
		'test-exchange-complete': createStorybookClaimExchange({
			exchangeId: 'test-exchange-complete',
			state: 'complete'
		})
	})

	const invalidExchangeSetup = createStorybookSetup({
		'test-exchange-invalid': createStorybookClaimExchange({
			exchangeId: 'test-exchange-invalid',
			state: 'invalid'
		})
	})

	const pausedExchangeSetup = createStorybookSetup({
		'test-exchange-paused': createStorybookClaimExchange({
			exchangeId: 'test-exchange-paused',
			state: 'active'
		})
	})

	const notFoundExchangeSetup = createStorybookSetup({})
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
		exchangeId="test-exchange-123"
		workflowId="claim"
		pollInterval={1000}
		maxPolls={5}
		exchangeService={activeExchangeSetup.exchangeService}
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
		exchangeId="test-exchange-complete"
		workflowId="claim"
		pollInterval={1000}
		exchangeService={completeExchangeSetup.exchangeService}
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
		exchangeId="test-exchange-invalid"
		workflowId="claim"
		pollInterval={1000}
		exchangeService={invalidExchangeSetup.exchangeService}
	/>
</Story>

<Story
	name="PausedAfterMaxPolls"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await waitFor(
			() => {
				const pausedText = canvas.getByText(/polling paused/i)
				expect(pausedText).toBeInTheDocument()
				const resumeButton = canvas.getByRole('button', { name: /resume/i })
				expect(resumeButton).toBeInTheDocument()
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
		exchangeId="test-exchange-paused"
		workflowId="claim"
		pollInterval={100}
		maxPolls={3}
		exchangeService={pausedExchangeSetup.exchangeService}
	/>
</Story>

<Story
	name="ExchangeNotFound"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await waitFor(
			() => {
				const errorDisplay = canvas.getByRole('alert')
				expect(errorDisplay).toBeInTheDocument()
			},
			{ timeout: 2000 }
		)
	}}
>
	<ExchangeStatusPoll
		exchangeId="non-existent-exchange"
		workflowId="claim"
		pollInterval={1000}
		exchangeService={notFoundExchangeSetup.exchangeService}
	/>
</Story>

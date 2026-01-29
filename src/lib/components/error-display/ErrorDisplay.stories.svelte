<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, within } from 'storybook/test'

	import ErrorDisplay from './ErrorDisplay.svelte'

	const { Story } = defineMeta({
		title: 'Components/ErrorDisplay',
		argTypes: {
			exchangeState: {
				control: 'select',
				options: ['pending', 'active', 'complete', 'invalid'],
				description: 'Exchange state - if invalid, shows exchange invalid error'
			},
			error: {
				control: 'object',
				description: 'Error object from API call'
			},
			message: {
				control: 'text',
				description: 'Custom error message'
			}
		},
		args: {}
	})
</script>

<Story
	name="ExchangeInvalid"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const alert = canvas.getByRole('alert')
		expect(alert).toBeInTheDocument()
		expect(alert).toHaveTextContent(/no longer valid/i)
	}}
>
	<ErrorDisplay exchangeState="invalid" />
</Story>

<Story
	name="NotFound404"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const alert = canvas.getByRole('alert')
		expect(alert).toBeInTheDocument()
		expect(alert).toHaveTextContent(/not found/i)
		expect(alert).toHaveTextContent(/expired/i)
	}}
>
	<ErrorDisplay error={{ status: 404, message: 'Not Found' }} />
</Story>

<Story
	name="NetworkError"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const alert = canvas.getByRole('alert')
		expect(alert).toBeInTheDocument()
		expect(alert).toHaveTextContent(/network error/i)
	}}
>
	<ErrorDisplay error={new Error('Network request failed')} />
</Story>

<Story
	name="TimeoutError"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const alert = canvas.getByRole('alert')
		expect(alert).toBeInTheDocument()
		expect(alert).toHaveTextContent(/timed out/i)
	}}
>
	<ErrorDisplay error={new Error('Request timeout')} />
</Story>

<Story
	name="ServerError500"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const alert = canvas.getByRole('alert')
		expect(alert).toBeInTheDocument()
		expect(alert).toHaveTextContent(/server error/i)
	}}
>
	<ErrorDisplay error={{ status: 500, message: 'Internal Server Error' }} />
</Story>

<Story
	name="CustomMessage"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const alert = canvas.getByRole('alert')
		expect(alert).toBeInTheDocument()
		expect(alert).toHaveTextContent('Custom error message here')
	}}
>
	<ErrorDisplay message="Custom error message here" />
</Story>

<Story
	name="GenericError"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const alert = canvas.getByRole('alert')
		expect(alert).toBeInTheDocument()
		expect(alert).toHaveTextContent('Something went wrong')
	}}
>
	<ErrorDisplay error={new Error('Something went wrong')} />
</Story>

<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, within } from 'storybook/test'
	import testVC from '../../../test-fixtures/testVC.js'
	import CredentialPreview from './CredentialPreview.svelte'

	const { Story } = defineMeta({
		title: 'Components/CredentialPreview',
		argTypes: {
			credential: {
				control: 'object',
				description: 'The credential data'
			}
		},
		args: {}
	})
</script>

<Story
	name="OpenBadgeCredential"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const preview = canvas.getByTestId('credential-preview')
		expect(preview).toBeInTheDocument()

		const typeTag = canvas.getByTestId('credential-type-tag')
		expect(typeTag).toHaveTextContent('Open Badge')

		const openBadge = canvas.getByTestId('open-badge')
		expect(openBadge).toBeInTheDocument()
	}}
>
	<CredentialPreview credential={testVC} />
</Story>

<Story
	name="AchievementCredential"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const preview = canvas.getByTestId('credential-preview')
		expect(preview).toBeInTheDocument()

		const typeTag = canvas.getByTestId('credential-type-tag')
		expect(typeTag).toHaveTextContent('Open Badge')

		const openBadge = canvas.getByTestId('open-badge')
		expect(openBadge).toBeInTheDocument()
	}}
>
	{@const achievementCredential = {
		...testVC,
		type: ['VerifiableCredential', 'AchievementCredential']
	}}
	<CredentialPreview credential={achievementCredential} />
</Story>

<Story
	name="UnsupportedCredentialType"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const preview = canvas.getByTestId('credential-preview')
		expect(preview).toBeInTheDocument()

		const typeTag = canvas.getByTestId('credential-type-tag')
		expect(typeTag).toHaveTextContent('Unknown')

		const unsupported = canvas.getByTestId('unsupported-credential')
		expect(unsupported).toBeInTheDocument()

		const message = within(unsupported).getByText(
			/Unsupported credential type/i
		)
		expect(message).toBeInTheDocument()
	}}
>
	{@const unsupportedCredential = {
		'@context': ['https://www.w3.org/2018/credentials/v1'],
		type: ['VerifiableCredential', 'CustomCredentialType'],
		issuer: 'did:key:test',
		credentialSubject: {}
	}}
	<CredentialPreview credential={unsupportedCredential} />
</Story>

<Story
	name="MissingCredentialData"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const preview = canvas.getByTestId('credential-preview')
		expect(preview).toBeInTheDocument()

		const typeTag = canvas.getByTestId('credential-type-tag')
		expect(typeTag).toHaveTextContent('Unknown')

		const unsupported = canvas.getByTestId('unsupported-credential')
		expect(unsupported).toBeInTheDocument()
	}}
>
	<CredentialPreview credential={null} />
</Story>

<Story
	name="StringCredential"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const preview = canvas.getByTestId('credential-preview')
		expect(preview).toBeInTheDocument()

		const typeTag = canvas.getByTestId('credential-type-tag')
		expect(typeTag).toHaveTextContent('Open Badge')

		const openBadge = canvas.getByTestId('open-badge')
		expect(openBadge).toBeInTheDocument()
	}}
>
	<CredentialPreview credential={JSON.stringify(testVC)} />
</Story>

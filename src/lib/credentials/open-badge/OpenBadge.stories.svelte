<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, within } from 'storybook/test'
	import testVC from '../../../test-fixtures/testVC.js'
	import OpenBadge from './OpenBadge.svelte'

	const { Story } = defineMeta({
		title: 'Credentials/OpenBadge',
		tags: ['autodocs'],
		argTypes: {
			credential: {
				control: 'object',
				description: 'The credential data (OpenBadgeCredential)'
			}
		},
		args: {}
	})
</script>

<Story
	name="BadgeWithImage"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const badge = canvas.getByTestId('open-badge')
		expect(badge).toBeInTheDocument()

		const badgeName = canvas.getByTestId('badge-name')
		expect(badgeName).toHaveTextContent('A Simply Wonderful Course')

		const badgeImage = canvas.queryByTestId('badge-image')
		// Image may or may not be present depending on credential data
	}}
>
	{@const credentialWithImage = {
		...testVC,
		credentialSubject: {
			...testVC.credentialSubject,
			achievement: {
				...testVC.credentialSubject.achievement,
				image: {
					id: 'https://via.placeholder.com/150',
					type: 'Image'
				}
			}
		}
	}}
	<OpenBadge credential={credentialWithImage} />
</Story>

<Story
	name="BadgeWithoutImage"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const badge = canvas.getByTestId('open-badge')
		expect(badge).toBeInTheDocument()

		const badgeName = canvas.getByTestId('badge-name')
		expect(badgeName).toHaveTextContent('A Simply Wonderful Course')

		const badgeImage = canvas.queryByTestId('badge-image')
		expect(badgeImage).not.toBeInTheDocument()
	}}
>
	<OpenBadge credential={testVC} />
</Story>

<Story
	name="BadgeWithFullDetails"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const badge = canvas.getByTestId('open-badge')
		expect(badge).toBeInTheDocument()

		const badgeName = canvas.getByTestId('badge-name')
		expect(badgeName).toHaveTextContent('A Simply Wonderful Course')

		const badgeDescription = canvas.getByTestId('badge-description')
		expect(badgeDescription).toHaveTextContent('Wonderful.')

		const badgeIssuer = canvas.getByTestId('badge-issuer')
		expect(badgeIssuer).toBeInTheDocument()

		const issuerName = within(badgeIssuer).getByText('University of Wonderful')
		expect(issuerName).toBeInTheDocument()
	}}
>
	<OpenBadge credential={testVC} />
</Story>

<Story
	name="BadgeWithMinimalDetails"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const badge = canvas.getByTestId('open-badge')
		expect(badge).toBeInTheDocument()

		const badgeName = canvas.getByTestId('badge-name')
		expect(badgeName).toHaveTextContent('Test Badge')

		const badgeDescription = canvas.queryByTestId('badge-description')
		expect(badgeDescription).not.toBeInTheDocument()
	}}
>
	{@const minimalCredential = {
		'@context': ['https://www.w3.org/2018/credentials/v1'],
		type: ['VerifiableCredential', 'OpenBadgeCredential'],
		issuer: {
			id: 'did:key:test',
			name: 'Test Issuer'
		},
		credentialSubject: {
			type: 'AchievementSubject',
			achievement: {
				type: 'Achievement',
				name: 'Test Badge'
			}
		}
	}}
	<OpenBadge credential={minimalCredential} />
</Story>

<Story
	name="BadgeWithStringCredential"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const badge = canvas.getByTestId('open-badge')
		expect(badge).toBeInTheDocument()

		const badgeName = canvas.getByTestId('badge-name')
		expect(badgeName).toHaveTextContent('A Simply Wonderful Course')
	}}
>
	<OpenBadge credential={JSON.stringify(testVC)} />
</Story>

<Story
	name="BadgeWithIssuerImage"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const badge = canvas.getByTestId('open-badge')
		expect(badge).toBeInTheDocument()

		const issuerImage = canvas.queryByTestId('issuer-image')
		expect(issuerImage).toBeInTheDocument()
		expect(issuerImage).toHaveAttribute('src', testVC.issuer.image.id)
	}}
>
	<OpenBadge credential={testVC} />
</Story>

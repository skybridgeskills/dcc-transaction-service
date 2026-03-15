import type { Meta, StoryObj } from '@storybook/react'
import { WalletInteraction } from './WalletInteraction'

const mockProtocols = {
  vcapi: 'https://example.com/workflows/verify/exchanges/test-123',
  iu: 'https://example.com/workflows/verify/exchanges/test-123/protocols?iuv=1'
}

const meta: Meta<typeof WalletInteraction> = {
  title: 'WalletInteraction',
  component: WalletInteraction,
  parameters: {
    layout: 'centered'
  }
}

export default meta
type Story = StoryObj<typeof WalletInteraction>

export const LCW: Story = {
  args: {
    selectedId: 'lcw',
    protocols: mockProtocols
  }
}

export const ASUPocket: Story = {
  args: {
    selectedId: 'asu-pocket',
    protocols: mockProtocols
  }
}

export const MySkillsPocket: Story = {
  args: {
    selectedId: 'my-skills-pocket',
    protocols: mockProtocols
  }
}

export const RawVcapiProtocol: Story = {
  args: {
    selectedId: 'vcapi',
    protocols: mockProtocols
  }
}

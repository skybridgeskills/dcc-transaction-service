import type { Meta, StoryObj } from '@storybook/react'
import { App } from './App'
import { FakeExchangeClient } from './services/fake-exchange-client'

const mockProtocols = {
  vcapi: 'https://example.com/workflows/verify/exchanges/test-123',
  iu: 'https://example.com/workflows/verify/exchanges/test-123/protocols?iuv=1'
}

const meta: Meta<typeof App> = {
  title: 'App',
  component: App,
  parameters: {
    layout: 'centered'
  }
}

export default meta
type Story = StoryObj<typeof App>

export const Pending: Story = {
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocols,
      states: 'pending'
    })
  }
}

export const Active: Story = {
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocols,
      states: 'active'
    })
  }
}

export const Complete: Story = {
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocols,
      states: 'complete'
    })
  }
}

export const Invalid: Story = {
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocols,
      states: 'invalid'
    })
  }
}

export const PendingToComplete: Story = {
  name: 'Pending → Complete',
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocols,
      states: ['pending', 'pending', 'active', 'complete']
    })
  }
}

import type { Meta, StoryObj } from '@storybook/react'
import { App } from './App'
import { FakeExchangeClient } from '../lib/services/exchange-client/fake-exchange-client'
import {
  createMockVerifierCoreResult,
  createMockCredential
} from '../test-fixtures/testData.js'

const mockProtocolsVerify = {
  vcapi: 'https://example.com/workflows/verify/exchanges/test-123',
  iu: 'https://example.com/workflows/verify/exchanges/test-123/protocols?iuv=1'
}

const mockProtocolsClaim = {
  vcapi: 'https://example.com/workflows/claim/exchanges/test-claim',
  iu: 'https://example.com/workflows/claim/exchanges/test-claim/protocols?iuv=1'
}

const mockProtocolsDidAuth = {
  vcapi: 'https://example.com/workflows/didAuth/exchanges/test-did',
  iu: 'https://example.com/workflows/didAuth/exchanges/test-did/protocols?iuv=1'
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
      protocols: mockProtocolsVerify,
      states: 'pending'
    })
  }
}

export const Active: Story = {
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      states: 'active'
    })
  }
}

/** Terminal: generic success when exchange payload has no workflow-specific data */
export const Complete: Story = {
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      states: 'complete'
    })
  }
}

export const Invalid: Story = {
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      states: 'invalid'
    })
  }
}

export const PendingToComplete: Story = {
  name: 'Pending → Complete',
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      states: ['pending', 'pending', 'active', 'complete'],
      workflowId: 'verify',
      variables: {
        features: { details: true },
        results: {
          default: verificationResultFromPresentation(
            createMockVerifierCoreResult(true, true)
          )
        }
      }
    })
  }
}

export const VerifySuccess: Story = {
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      states: 'complete',
      workflowId: 'verify',
      variables: {
        features: { details: true },
        results: {
          default: verificationResultFromPresentation(
            createMockVerifierCoreResult(true, true)
          )
        }
      }
    })
  }
}

export const VerifyFailureFatal: Story = {
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      states: 'invalid',
      workflowId: 'verify',
      variables: {
        features: { details: true },
        results: {
          default: verificationResultFromPresentation(
            createMockVerifierCoreResult(false, true)
          )
        }
      }
    })
  }
}

export const VerifyFailureMixed: Story = {
  name: 'Verify failure (non-fatal registry)',
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      states: 'invalid',
      workflowId: 'verify',
      variables: {
        features: { details: true },
        results: {
          default: mixedRegistryFailureResult()
        }
      }
    })
  }
}

export const VerifyDetailsDisabled: Story = {
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      states: 'invalid',
      workflowId: 'verify',
      variables: {
        features: { details: false },
        results: {
          default: verificationResultFromPresentation(
            createMockVerifierCoreResult(false, true)
          )
        }
      }
    })
  }
}

export const ClaimComplete: Story = {
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsClaim,
      states: 'complete',
      workflowId: 'claim',
      variables: {
        features: { details: true },
        results: {
          default: { verifiableCredential: [createMockCredential()] }
        }
      }
    })
  }
}

export const ClaimInvalid: Story = {
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsClaim,
      states: 'invalid',
      workflowId: 'claim',
      variables: {
        features: { details: true }
      }
    })
  }
}

export const DidAuthComplete: Story = {
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsDidAuth,
      states: 'complete',
      workflowId: 'didAuth',
      variables: {
        features: { details: true },
        results: {
          default: {
            holder:
              'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
          }
        }
      }
    })
  }
}

export const DidAuthInvalid: Story = {
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsDidAuth,
      states: 'invalid',
      workflowId: 'didAuth',
      variables: {
        features: { details: true }
      }
    })
  }
}

function verificationResultFromPresentation(
  p: ReturnType<typeof createMockVerifierCoreResult>
): App.VerificationResult {
  const allResults: App.CheckResult[] = [
    ...p.presentationResults,
    ...p.credentialResults.flatMap((c) => c.results as App.CheckResult[])
  ]
  return {
    verified: p.verified,
    presentationResults: p.presentationResults as App.CheckResult[],
    credentialResults: p.credentialResults as App.CredentialVerificationResult[],
    allResults,
    matchedCredentials: p.credentialResults.map((c) => c.credential)
  }
}

function mixedRegistryFailureResult(): App.VerificationResult {
  const ts = '2026-04-15T12:00:00.000Z'
  const credential = createMockCredential()
  const presentationResults: App.CheckResult[] = [
    {
      check: 'proof.signature',
      suite: 'proof',
      outcome: { status: 'success', message: 'Presentation signature verified.' },
      timestamp: ts,
      fatal: true
    }
  ]
  const credentialResults: App.CredentialVerificationResult[] = [
    {
      verified: false,
      credential,
      results: [
        {
          check: 'proof.signature',
          suite: 'proof',
          outcome: { status: 'success', message: 'Credential signature verified.' },
          timestamp: ts,
          fatal: true
        },
        {
          check: 'registry.issuer',
          suite: 'registry',
          outcome: {
            status: 'failure',
            problems: [
              {
                title: 'Issuer Not Registered',
                detail:
                  'Issuer was not found in any known DID registry.',
                type: 'https://www.w3.org/TR/vc-data-model#ISSUER_NOT_REGISTERED'
              }
            ]
          },
          timestamp: ts,
          fatal: false
        }
      ]
    }
  ]
  const allResults: App.CheckResult[] = [
    ...presentationResults,
    ...credentialResults.flatMap((c) => c.results)
  ]
  return {
    verified: false,
    presentationResults,
    credentialResults,
    allResults,
    matchedCredentials: []
  }
}

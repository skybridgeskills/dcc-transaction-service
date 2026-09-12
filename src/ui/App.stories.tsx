import type { Meta, StoryObj } from '@storybook/react'
import { App } from './App.js'
import { FakeExchangeClient } from '../lib/services/exchange-client/fake-exchange-client.js'
import {
  createMockVerifierCoreResult,
  createMockCredential
} from '../test-fixtures/testData.js'
import { MANY_PRESETS, PRESETS, DROPPED_PIN, VPR_PROFILE } from './preset-fixtures.js'

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

/**
 * ⚠️ **Put the story at a URL before it renders.** `App` reads `?payload=` and
 * `?protocolProfile=` out of `window.location` — that URL is the audience
 * discriminator, and an operator always arrives from a test case carrying one.
 * A story that could not set it could not show the operator's view at all.
 */
const atUrl =
  (search: string) =>
  (Story: () => JSX.Element): JSX.Element => {
    window.history.replaceState(null, '', `/interactions/story-1${search}`)
    return <Story />
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
      presets: PRESETS,
      states: 'pending'
    })
  }
}

export const Active: Story = {
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      presets: PRESETS,
      states: 'active'
    })
  }
}

/** Terminal: generic success when exchange payload has no workflow-specific data */
export const Complete: Story = {
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      presets: PRESETS,
      states: 'complete'
    })
  }
}

export const Invalid: Story = {
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      presets: PRESETS,
      states: 'invalid'
    })
  }
}

export const PendingToComplete: Story = {
  name: 'Pending → Complete',
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      presets: PRESETS,
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
      presets: PRESETS,
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
      presets: PRESETS,
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
      presets: PRESETS,
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
      presets: PRESETS,
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
      presets: PRESETS,
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
      presets: PRESETS,
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
      presets: PRESETS,
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
      presets: PRESETS,
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
  const credentialResults = p.credentialResults.map(
    (c) =>
      ({
        ...c,
        summary: deriveSummaries(c.results as App.CheckResult[])
      }) as App.CredentialVerificationResult
  )
  return {
    verified: p.verified,
    presentationResults: p.presentationResults as App.CheckResult[],
    credentialResults,
    matchedCredentials: credentialResults.map((c) => c.verifiableCredential),
    summary: deriveSummaries(p.presentationResults as App.CheckResult[])
  }
}

function deriveSummaries(results: App.CheckResult[]): App.SuiteSummary[] {
  const bySuite = new Map<string, App.CheckResult[]>()
  for (const r of results) {
    // Derive suite from id: "<phase>.<suite>.<localPart>" → suite
    const parts = r.id.split('.')
    const key = parts.length >= 2 ? parts[1] : r.id
    const list = bySuite.get(key) ?? []
    list.push(r)
    bySuite.set(key, list)
  }
  return Array.from(bySuite.entries()).map(([suite, group]) => {
    const passed = group.filter((g) => g.outcome.status === 'success').length
    const failed = group.filter((g) => g.outcome.status === 'failure').length
    const skipped = group.filter((g) => g.outcome.status === 'skipped').length
    const status: App.SuiteSummary['status'] =
      failed === 0
        ? passed === 0
          ? 'skipped'
          : 'success'
        : passed + skipped === 0
          ? 'failure'
          : 'mixed'
    const id = `cryptographic.${suite}`
    return {
      id,
      phase: 'cryptographic',
      suite,
      status,
      verified: failed === 0,
      message:
        failed === 0
          ? `${passed} of ${group.length} checks passed`
          : `${failed} of ${group.length} checks failed`,
      counts: { passed, failed, skipped }
    }
  })
}

// ---------------------------------------------------------------------------
// Phase 5 stories — exercise verifier-core 2.x summary/timing/verbose paths.
// ---------------------------------------------------------------------------

export const VerifyVerbose: Story = {
  name: 'Verify (verbose)',
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      presets: PRESETS,
      states: 'complete',
      workflowId: 'verify',
      variables: {
        features: { details: true },
        options: { verbose: true },
        results: {
          default: verificationResultFromPresentation(
            createMockVerifierCoreResult(true, true)
          )
        }
      }
    })
  }
}

export const VerifyWithTiming: Story = {
  name: 'Verify (with timing)',
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      presets: PRESETS,
      states: 'complete',
      workflowId: 'verify',
      variables: {
        features: { details: true },
        options: { timing: true },
        results: {
          default: timingPopulatedResult()
        }
      }
    })
  }
}

export const VerifyFatalOnly: Story = {
  name: 'Verify (fatal short-circuit)',
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      presets: PRESETS,
      states: 'invalid',
      workflowId: 'verify',
      variables: {
        features: { details: true },
        results: { default: fatalShortCircuitResult() }
      }
    })
  }
}

export const VerifyOBSchemaWarning: Story = {
  name: 'Verify (OB schema warning)',
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      presets: PRESETS,
      states: 'complete',
      workflowId: 'verify',
      variables: {
        features: { details: true },
        results: { default: obSchemaWarningResult() }
      }
    })
  }
}

export const CollapsedHeadlineVisible: Story = {
  name: 'Collapsed PhaseRow shows headline',
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      presets: PRESETS,
      states: 'complete',
      workflowId: 'verify',
      variables: {
        features: { details: true },
        results: { default: obSchemaWarningResult() }
      }
    })
  }
}

export const AllSkippedRecognition: Story = {
  name: 'All-skipped recognition phase is hidden',
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      presets: PRESETS,
      states: 'complete',
      workflowId: 'verify',
      variables: {
        features: { details: true },
        results: { default: allSkippedRecognitionResult() }
      }
    })
  }
}

function timingPopulatedResult(): App.VerificationResult {
  const base = verificationResultFromPresentation(
    createMockVerifierCoreResult(true, true)
  )
  const tt = (durationMs: number): App.TaskTiming => ({
    startedAt: '2026-04-19T12:00:00.000Z',
    endedAt: '2026-04-19T12:00:00.010Z',
    durationMs
  })
  return {
    ...base,
    timing: tt(42),
    summary: base.summary?.map((s) => ({ ...s, timing: tt(8) })),
    credentialResults: base.credentialResults.map((cr) => ({
      ...cr,
      timing: tt(20),
      summary: cr.summary?.map((s) => ({ ...s, timing: tt(5) }))
    }))
  }
}

function fatalShortCircuitResult(): App.VerificationResult {
  const cred = createMockCredential()
  const failingCheck: App.CheckResult = {
    id: 'cryptographic.proof.signature-valid',
    outcome: {
      status: 'failure',
      problems: [
        {
          title: 'Invalid signature',
          detail: 'Credential signature did not verify; later checks skipped.',
          type: 'https://w3id.org/security#INVALID_SIGNATURE'
        }
      ]
    },
    fatal: true
  }
  const credentialResults: App.CredentialVerificationResult[] = [
    {
      verified: false,
      verifiableCredential: cred,
      results: [failingCheck],
      summary: [
        {
          id: 'cryptographic.proof',
          phase: 'cryptographic',
          suite: 'proof',
          status: 'failure',
          verified: false,
          message: '1 of 3 checks failed (2 not run after fatal)',
          counts: { passed: 0, failed: 1, skipped: 0 },
          fatalFailureAt: 'cryptographic.proof.signature-valid'
        }
      ]
    }
  ]
  return {
    verified: false,
    presentationResults: [],
    credentialResults,
    matchedCredentials: [],
    summary: []
  }
}

function obSchemaWarningResult(): App.VerificationResult {
  const cred = createMockCredential()
  const warning: App.CheckResult = {
    id: 'semantic.openbadges-3.schema',
    outcome: {
      status: 'failure',
      problems: [
        {
          title: 'OB v3 schema warning',
          detail: 'achievement.criteria.narrative is recommended but missing.',
          type: 'https://1edtech.org/openbadges/v3#SCHEMA_WARNING'
        }
      ]
    },
    fatal: false
  }
  const credentialResults: App.CredentialVerificationResult[] = [
    {
      verified: true,
      verifiableCredential: cred,
      recognizedProfile: 'obv3p0.openbadge',
      results: [warning],
      summary: [
        {
          id: 'cryptographic.proof',
          phase: 'cryptographic',
          suite: 'proof',
          status: 'success',
          verified: true,
          message: '2 of 2 checks passed',
          counts: { passed: 2, failed: 0, skipped: 0 }
        },
        {
          id: 'semantic.openbadges-3',
          phase: 'semantic',
          suite: 'openbadges-3',
          status: 'mixed',
          verified: false,
          message: '1 of 3 checks failed (2 passed)',
          counts: { passed: 2, failed: 1, skipped: 0 }
        }
      ]
    }
  ]
  return {
    verified: true,
    presentationResults: [],
    credentialResults,
    matchedCredentials: [cred],
    summary: []
  }
}

function allSkippedRecognitionResult(): App.VerificationResult {
  const cred = createMockCredential()
  const credentialResults: App.CredentialVerificationResult[] = [
    {
      verified: true,
      verifiableCredential: cred,
      results: [],
      summary: [
        {
          id: 'cryptographic.proof',
          phase: 'cryptographic',
          suite: 'proof',
          status: 'success',
          verified: true,
          message: '2 of 2 checks passed',
          counts: { passed: 2, failed: 0, skipped: 0 }
        },
        {
          id: 'recognition.openbadges',
          phase: 'recognition',
          suite: 'openbadges',
          status: 'skipped',
          verified: true,
          message: '1 of 1 check skipped',
          counts: { passed: 0, failed: 0, skipped: 1 }
        },
        {
          id: 'recognition.vcalm',
          phase: 'recognition',
          suite: 'vcalm',
          status: 'skipped',
          verified: true,
          message: '1 of 1 check skipped',
          counts: { passed: 0, failed: 0, skipped: 1 }
        }
      ]
    }
  ]
  return {
    verified: true,
    presentationResults: [],
    credentialResults,
    matchedCredentials: [cred],
    summary: []
  }
}

function mixedRegistryFailureResult(): App.VerificationResult {
  const credential = createMockCredential()
  const presentationResults: App.CheckResult[] = [
    {
      id: 'cryptographic.proof.signature',
      outcome: { status: 'success', message: 'Presentation signature verified.' },
      fatal: true
    }
  ]
  const credentialResults: App.CredentialVerificationResult[] = [
    {
      verified: false,
      verifiableCredential: credential,
      results: [
        {
          id: 'cryptographic.proof.signature',
          outcome: { status: 'success', message: 'Credential signature verified.' },
          fatal: true
        },
        {
          id: 'trust.registry.issuer',
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
          fatal: false
        }
      ],
      summary: [
        {
          id: 'cryptographic.proof',
          phase: 'cryptographic',
          suite: 'proof',
          status: 'success',
          verified: true,
          message: '1 of 1 checks passed',
          counts: { passed: 1, failed: 0, skipped: 0 }
        },
        {
          id: 'trust.registry',
          phase: 'trust',
          suite: 'registry',
          status: 'failure',
          verified: false,
          message: '1 of 1 checks failed',
          counts: { passed: 0, failed: 1, skipped: 0 }
        }
      ]
    }
  ]
  return {
    verified: false,
    presentationResults,
    credentialResults,
    matchedCredentials: [],
    summary: [
      {
        id: 'cryptographic.proof',
        phase: 'cryptographic',
        suite: 'proof',
        status: 'success',
        verified: true,
        message: '1 of 1 checks passed',
        counts: { passed: 1, failed: 0, skipped: 0 }
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// The preset picker — concept G.
//
// ⚠️ **These are the shipped design's acceptance, at both widths.** Every story
// below was a review finding: one list, search that promotes rather than hides,
// a checkbox governing list membership only, a bounded list only when Advanced
// is ticked, an expected refusal that reads as an option, and a mismatch refusal
// that fires on a DROPPED pin.
// ---------------------------------------------------------------------------

/** The user's view: the plain rows, which must never scroll. */
export const PickerPlain: Story = {
  name: 'Picker — plain (480px)',
  decorators: [atUrl('')],
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      presets: PRESETS,
      states: 'active'
    })
  }
}

/** ⚠️ 360 px — the width where the retired interaction method line wrapped out of view. */
export const PickerNarrow: Story = {
  name: 'Picker — plain (360px)',
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  decorators: [atUrl('')],
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      presets: PRESETS,
      states: 'active'
    })
  }
}

/**
 * ⚠️ The operator's view. Tick **Include advanced options**: the rows append
 * without moving one the user was about to tap, and the decode block appears
 * beside the QR — one control, one effect, one place.
 */
export const PickerAdvanced: Story = {
  name: 'Picker — advanced (arrives pinned)',
  decorators: [atUrl(`?payload=iu&protocolProfile=${VPR_PROFILE}`)],
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      presets: PRESETS,
      states: 'active'
    })
  }
}

/**
 * ⚠️ Many constructions. The advanced list is bounded and scrolls INTERNALLY —
 * the QR must stay on screen, because the QR is the thing being scanned.
 */
export const PickerManyProfiles: Story = {
  name: 'Picker — 26 constructions',
  decorators: [atUrl('')],
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      presets: MANY_PRESETS,
      states: 'active'
    })
  }
}

/**
 * ⚠️ **The QR/preset mismatch, on a DROPPED pin.** The row names a construction
 * the payload does not carry. Red is reserved for this and nothing else.
 */
export const PickerMismatch: Story = {
  name: 'Picker — QR/preset mismatch',
  decorators: [atUrl(`?payload=iu&protocolProfile=${VPR_PROFILE}`)],
  args: {
    exchangeClient: new FakeExchangeClient({
      protocols: mockProtocolsVerify,
      presets: [PRESETS[0]!, DROPPED_PIN],
      states: 'active'
    })
  }
}

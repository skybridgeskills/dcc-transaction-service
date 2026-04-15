import type { CSSProperties } from 'react'
import { VerificationResults } from './VerificationResults'
import { Details } from './Details'
import type {
  ExchangeState,
  ExchangeStatusVariables
} from '../lib/services/exchange-client/exchange-client'

export function TerminalView({
  state,
  workflowId,
  variables
}: {
  state: ExchangeState
  workflowId?: string
  variables?: ExchangeStatusVariables
}) {
  const features = variables?.features

  if (workflowId === 'verify') {
    const vr = parseVerificationResult(variables?.results?.default)
    if (vr) {
      return <VerificationResults result={vr} features={features} />
    }
    return <GenericTerminal state={state} />
  }

  if (workflowId === 'claim') {
    if (state === 'complete') {
      const cr = parseClaimResults(variables?.results)
      return (
        <div style={successPanel}>
          <p style={titleStyle}>Credential issued</p>
          <p style={bodyStyle}>{credentialSummaryLine(cr)}</p>
          {features?.details !== false ? (
            <Details summary="Details">
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#166534' }}>
                The credential was stored with this exchange. You can return to your wallet to
                view it.
              </p>
            </Details>
          ) : null}
        </div>
      )
    }
    return workflowErrorPanel(
      'Exchange could not be completed',
      'Issuing the credential did not finish. Please try again or contact support.',
      features
    )
  }

  if (workflowId === 'didAuth') {
    if (state === 'complete') {
      const holder = parseDidAuthHolder(variables?.results)
      return (
        <div style={successPanel}>
          <p style={titleStyle}>DID authenticated</p>
          <p style={bodyStyle}>
            {holder
              ? `Holder: ${abbreviateDid(holder)}`
              : 'Your wallet authenticated successfully.'}
          </p>
          {features?.details !== false && holder ? (
            <Details summary="Details">
              <p
                style={{
                  margin: 0,
                  fontSize: '0.8125rem',
                  wordBreak: 'break-all' as const,
                  color: '#166534'
                }}
              >
                {holder}
              </p>
            </Details>
          ) : null}
        </div>
      )
    }
    return workflowErrorPanel(
      'Exchange could not be completed',
      'DID authentication did not finish. Please try again or contact support.',
      features
    )
  }

  return <GenericTerminal state={state} />
}

const successPanel: CSSProperties = {
  padding: '24px',
  borderRadius: '8px',
  background: '#f0fdf4',
  border: '1px solid #bbf7d0',
  color: '#166534',
  textAlign: 'center' as const
}

const titleStyle: CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: 600,
  margin: '0 0 8px'
}

const bodyStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.95rem'
}

function GenericTerminal({ state }: { state: ExchangeState }) {
  const ok = state === 'complete'
  return (
    <div
      style={{
        padding: '24px',
        borderRadius: '8px',
        textAlign: 'center' as const,
        ...(ok
          ? {
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              color: '#166534'
            }
          : {
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b'
            })
      }}
    >
      <p style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0 0 8px' }}>
        {ok ? 'Success' : 'Exchange invalid'}
      </p>
      <p style={{ margin: 0, fontSize: '0.95rem' }}>
        {ok
          ? 'The exchange has been completed successfully.'
          : 'This exchange could not be completed. Please try again or contact support.'}
      </p>
    </div>
  )
}

function workflowErrorPanel(
  title: string,
  body: string,
  features?: Record<string, string | boolean>
) {
  return (
    <div
      style={{
        padding: '24px',
        borderRadius: '8px',
        background: '#fef2f2',
        border: '1px solid #fecaca',
        color: '#991b1b',
        textAlign: 'center' as const
      }}
    >
      <p style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0 0 8px' }}>{title}</p>
      <p style={{ margin: 0, fontSize: '0.95rem' }}>{body}</p>
      {features?.details !== false ? (
        <Details summary="Details">
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#991b1b' }}>
            If this keeps happening, contact support with the time of the attempt and your
            organization.
          </p>
        </Details>
      ) : null}
    </div>
  )
}

function parseVerificationResult(raw: unknown): App.VerificationResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<App.VerificationResult>
  if (typeof r.verified !== 'boolean') return null
  if (!Array.isArray(r.presentationResults) || !Array.isArray(r.credentialResults)) return null
  return raw as App.VerificationResult
}

function parseClaimResults(
  results: Record<string, unknown> | undefined
): { verifiableCredential: unknown[] } | null {
  const d = results?.default
  if (!d || typeof d !== 'object') return null
  const vc = (d as { verifiableCredential?: unknown }).verifiableCredential
  if (!Array.isArray(vc)) return null
  return { verifiableCredential: vc }
}

function parseDidAuthHolder(results: Record<string, unknown> | undefined): string | null {
  const d = results?.default
  if (!d || typeof d !== 'object') return null
  const h = (d as { holder?: unknown }).holder
  return typeof h === 'string' && h.length > 0 ? h : null
}

function credentialSummaryLine(cr: { verifiableCredential: unknown[] } | null): string {
  if (!cr?.verifiableCredential?.length) {
    return 'Your credential was issued successfully.'
  }
  const c = cr.verifiableCredential[0] as Record<string, unknown> | null
  if (!c || typeof c !== 'object') return 'Your credential was issued successfully.'
  if (typeof c.name === 'string' && c.name.length > 0) return c.name
  const sub = c.credentialSubject as Record<string, unknown> | undefined
  const ach = sub?.achievement as Record<string, unknown> | undefined
  if (ach && typeof ach.name === 'string' && ach.name.length > 0) return ach.name
  return 'Your credential was issued successfully.'
}

function abbreviateDid(did: string, head = 16, tail = 10): string {
  if (did.length <= head + tail + 1) return did
  return `${did.slice(0, head)}…${did.slice(-tail)}`
}

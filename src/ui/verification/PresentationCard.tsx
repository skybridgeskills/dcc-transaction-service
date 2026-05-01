import type { CSSProperties } from 'react'

/**
 * Top-level verdict + per-credential headline.
 *
 * Renders the overall verified/not-verified badge and a "X of Y
 * verified" line driven by `result.credentialResults`. Per-suite
 * VP-level chips read from `result.summary` (presentation envelope
 * verification, distinct from per-credential checks).
 */
export function PresentationCard({
  result
}: {
  result: App.VerificationResult
}) {
  const verifiedCreds = result.credentialResults.filter(
    (cr) => cr.verified
  ).length
  const totalCreds = result.credentialResults.length
  const ok = result.verified

  return (
    <div
      style={{
        padding: '24px',
        borderRadius: '8px',
        textAlign: 'center' as const,
        ...(ok ? successStyle : failureStyle)
      }}
    >
      <p style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0 0 8px' }}>
        {ok ? 'Verified' : 'Not verified'}
      </p>
      <p style={{ margin: 0, fontSize: '0.95rem' }} data-testid="presentation-headline">
        {totalCreds === 0
          ? 'No credentials in presentation.'
          : `${verifiedCreds} of ${totalCreds} ${
              totalCreds === 1 ? 'credential' : 'credentials'
            } verified`}
      </p>
      {result.summary && result.summary.length > 0 ? (
        <div style={chipRow} data-testid="presentation-suite-chips">
          <p style={chipRowLabel}>Presentation envelope checks:</p>
          {result.summary.map((s) => (
            <span key={s.id} style={chipStyle(s.status)}>
              {s.suite}: {s.message}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const successStyle: CSSProperties = {
  background: '#f0fdf4',
  border: '1px solid #bbf7d0',
  color: '#166534'
}

const failureStyle: CSSProperties = {
  background: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#991b1b'
}

const chipRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: '6px',
  marginTop: '12px',
  justifyContent: 'center'
}

const chipRowLabel: CSSProperties = {
  width: '100%',
  margin: '8px 0 4px',
  fontSize: '0.75rem',
  color: '#6b7280'
}

const chipStyle = (status: App.SuiteSummary['status']): CSSProperties => ({
  padding: '2px 8px',
  borderRadius: '12px',
  fontSize: '0.75rem',
  background:
    status === 'success'
      ? '#dcfce7'
      : status === 'failure'
        ? '#fee2e2'
        : status === 'mixed'
          ? '#fef3c7'
          : '#e5e7eb',
  color: '#1f2937'
})

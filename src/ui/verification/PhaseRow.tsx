import type { CSSProperties } from 'react'
import { Details } from '../Details'
import { FailureDetailList } from './FailureDetailList'
import { failureDetail } from './helpers'

/**
 * One row per `SuiteSummary`. Status badge from `summary.status`;
 * lazy-expand reveals the relevant `CheckResult`s via
 * {@link FailureDetailList}.
 *
 * Honors `showDetails === false` (collapses to a one-line summary
 * with no expand affordance).
 */
export function PhaseRow({
  cr,
  summary,
  showDetails,
  verbose
}: {
  cr: App.CredentialVerificationResult
  summary: App.SuiteSummary
  showDetails: boolean
  verbose: boolean
}) {
  const matches = failureDetail(cr, summary)

  const headline = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <span aria-hidden style={statusDot(summary.status)} />
      <span style={{ fontWeight: 600, color: '#374151' }}>{summary.suite}</span>
      <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
        {summary.message}
      </span>
    </span>
  )

  if (!showDetails || matches.length === 0) {
    return (
      <div data-testid="phase-row" style={rowStyle}>
        {headline}
      </div>
    )
  }

  return (
    <div data-testid="phase-row" style={rowStyle}>
      <Details summary={headline}>
        <FailureDetailList results={matches} verbose={verbose} />
      </Details>
    </div>
  )
}

const rowStyle: CSSProperties = {
  padding: '8px 0',
  borderBottom: '1px solid #f3f4f6'
}

const statusDot = (status: App.SuiteSummary['status']): CSSProperties => ({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  flexShrink: 0,
  background:
    status === 'success'
      ? '#16a34a'
      : status === 'failure'
        ? '#dc2626'
        : status === 'mixed'
          ? '#d97706'
          : '#6b7280'
})

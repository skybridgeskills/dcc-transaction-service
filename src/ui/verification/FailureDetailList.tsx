import type { CSSProperties } from 'react'

/**
 * Lazy-expand body for a {@link PhaseRow}: lists the per-check
 * `CheckResult`s that belong to the parent suite.
 *
 * Header changes from "Failures" to "All checks" in verbose mode
 * (where `results[]` includes passing checks too — the per-check
 * detail covers more than just failures).
 */
export function FailureDetailList({
  results,
  verbose
}: {
  results: App.CheckResult[]
  verbose: boolean
}) {
  if (results.length === 0) return null

  return (
    <div data-testid="failure-detail-list">
      <p style={headerStyle}>{verbose ? 'All checks' : 'Failures'}</p>
      <ul style={listStyle}>
        {results.map((r, i) => (
          <li key={`${r.id}-${i}`} style={itemStyle}>
            <CheckLine result={r} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function CheckLine({ result }: { result: App.CheckResult }) {
  const id = result.id
  const outcome = result.outcome
  if (outcome.status === 'success') {
    return (
      <>
        <code style={idStyle}>{id}</code>
        <span style={{ color: '#15803d' }}> — {outcome.message}</span>
      </>
    )
  }
  if (outcome.status === 'skipped') {
    return (
      <>
        <code style={idStyle}>{id}</code>
        <span style={{ color: '#6b7280' }}> — skipped: {outcome.reason}</span>
      </>
    )
  }
  const p0 = outcome.problems[0]
  return (
    <>
      <code style={idStyle}>{id}</code>
      {p0 ? (
        <div style={{ marginTop: '4px', color: '#b91c1c' }}>
          <div style={{ fontWeight: 600 }}>{p0.title}</div>
          {p0.detail ? (
            <div style={{ marginTop: '2px', color: '#6b7280' }}>{p0.detail}</div>
          ) : null}
          {outcome.problems.length > 1 ? (
            <div style={{ marginTop: '2px', color: '#6b7280' }}>
              +{outcome.problems.length - 1} more
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

const headerStyle: CSSProperties = {
  margin: '0 0 6px',
  fontWeight: 600,
  fontSize: '0.875rem',
  color: '#374151'
}

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0
}

const itemStyle: CSSProperties = {
  padding: '6px 0',
  borderBottom: '1px solid #f3f4f6',
  fontSize: '0.8125rem'
}

const idStyle: CSSProperties = {
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '0.8125rem',
  color: '#374151'
}

import type { CSSProperties } from 'react'

const rowBase: CSSProperties = {
  display: 'flex',
  gap: '10px',
  alignItems: 'flex-start',
  padding: '8px 0',
  borderBottom: '1px solid #f3f4f6',
  fontSize: '0.875rem',
  textAlign: 'left' as const
}

export function CheckResultRow({ result }: { result: App.CheckResult }) {
  const outcome = result.outcome
  const dotColor =
    outcome.status === 'success'
      ? '#166534'
      : outcome.status === 'skipped'
        ? '#6b7280'
        : result.fatal === false
          ? '#b45309'
          : '#991b1b'

  let body: React.ReactNode
  if (outcome.status === 'success') {
    body = (
      <>
        <span style={{ color: '#374151', fontWeight: 500 }}>{result.check}</span>
        <div style={{ color: '#6b7280', marginTop: '2px' }}>{outcome.message}</div>
      </>
    )
  } else if (outcome.status === 'skipped') {
    body = (
      <>
        <span style={{ color: '#374151', fontWeight: 500 }}>{result.check}</span>
        <div style={{ color: '#6b7280', marginTop: '2px' }}>{outcome.reason}</div>
      </>
    )
  } else {
    const p0 = outcome.problems[0]
    body = (
      <>
        <span style={{ color: '#374151', fontWeight: 500 }}>{result.check}</span>
        {p0 && (
          <div style={{ color: '#6b7280', marginTop: '4px', fontSize: '0.8125rem' }}>
            <div style={{ fontWeight: 600 }}>{p0.title}</div>
            {p0.detail ? <div style={{ marginTop: '6px' }}>{p0.detail}</div> : null}
            {outcome.problems.length > 1 ? (
              <div style={{ marginTop: '6px', fontSize: '0.8125rem', color: '#6b7280' }}>
                +{outcome.problems.length - 1} more
              </div>
            ) : null}
          </div>
        )}
      </>
    )
  }

  return (
    <div style={rowBase}>
      <span
        aria-hidden
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: dotColor,
          marginTop: '6px',
          flexShrink: 0
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>{body}</div>
    </div>
  )
}

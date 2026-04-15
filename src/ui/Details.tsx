import type { ReactNode } from 'react'

export function Details({
  summary,
  children
}: {
  summary: string
  children: ReactNode
}) {
  return (
    <details
      style={{
        marginTop: '16px',
        padding: '12px 14px',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        background: '#fafafa'
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '0.9rem',
          color: '#374151',
          userSelect: 'none'
        }}
      >
        {summary}
      </summary>
      <div style={{ marginTop: '12px' }}>{children}</div>
    </details>
  )
}

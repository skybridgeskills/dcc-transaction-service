import type { CSSProperties } from 'react'
import { Details } from '../Details'

/**
 * Optional timing breakdown panel.
 *
 * Mounts only when {@link anyTiming} returned true; renders the
 * top-level inclusive timing alongside per-credential and
 * per-suite rollups so an operator can spot slow phases at a
 * glance. Per-check sub-timings live inside the lazy-expanded
 * detail rows for the corresponding suite (verbose mode).
 */
export function TimingPanel({ result }: { result: App.VerificationResult }) {
  return (
    <Details summary="Timing breakdown">
      <div data-testid="timing-panel">
        {result.timing ? <TimingLine label="Total" timing={result.timing} /> : null}
        {result.summary?.map((s) =>
          s.timing ? (
            <TimingLine
              key={`top-${s.id}`}
              label={`presentation • ${s.id}`}
              timing={s.timing}
            />
          ) : null
        )}
        {result.credentialResults.map((cr, i) => (
          <CredentialTiming key={i} cr={cr} index={i} />
        ))}
      </div>
    </Details>
  )
}

function CredentialTiming({
  cr,
  index
}: {
  cr: App.CredentialVerificationResult
  index: number
}) {
  if (!cr.timing && !(cr.summary ?? []).some((s) => s.timing)) return null
  return (
    <div style={{ marginTop: '8px' }}>
      <p style={subheaderStyle}>credential {index + 1}</p>
      {cr.timing ? <TimingLine label="Total" timing={cr.timing} /> : null}
      {(cr.summary ?? []).map((s) =>
        s.timing ? (
          <TimingLine key={s.id} label={s.id} timing={s.timing} />
        ) : null
      )}
    </div>
  )
}

function TimingLine({
  label,
  timing
}: {
  label: string
  timing: App.TaskTiming
}) {
  return (
    <div style={lineStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={durationStyle}>{timing.durationMs.toFixed(2)} ms</span>
    </div>
  )
}

const lineStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '4px 0',
  borderBottom: '1px solid #f3f4f6',
  fontSize: '0.8125rem'
}

const labelStyle: CSSProperties = {
  color: '#374151'
}

const durationStyle: CSSProperties = {
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  color: '#6b7280'
}

const subheaderStyle: CSSProperties = {
  margin: '8px 0 4px',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#6b7280'
}

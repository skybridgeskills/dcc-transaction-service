import type { CSSProperties } from 'react'
import { PhaseRow } from './PhaseRow.js'
import { groupByPhase, isPhaseAllSkipped, phaseOrder, type PhaseKey } from './helpers.js'

/**
 * Renders one credential's verification breakdown.
 *
 * Title resolves from `verifiableCredential.name` →
 * `credentialSubject.achievement.name` → falls back to the
 * credential `id` or "Credential N+1". Renders the
 * `recognizedProfile` badge when verifier-core matched a
 * recognizer, then walks {@link phaseOrder} to render one
 * {@link PhaseRow} per `SuiteSummary` (skipping empty phases and phases where every suite is `skipped`).
 */
export function CredentialCard({
  cr,
  index,
  showDetails,
  verbose
}: {
  cr: App.CredentialVerificationResult
  index: number
  showDetails: boolean
  verbose: boolean
}) {
  const grouped = groupByPhase(cr)
  const title = credentialTitle(cr, index)

  return (
    <section data-testid="credential-card" style={cardStyle}>
      <header style={headerStyle}>
        <span aria-hidden style={statusDot(cr.verified)} />
        <h3 style={titleStyle}>{title}</h3>
        {cr.recognizedProfile ? (
          <span style={badgeStyle} data-testid="recognized-profile-badge">
            {cr.recognizedProfile}
          </span>
        ) : null}
      </header>
      {(phaseOrder as readonly PhaseKey[])
        .filter((p) => grouped[p].length > 0 && !isPhaseAllSkipped(grouped[p]))
        .map((p) => (
          <div key={p} data-testid={`phase-${p}`}>
            <h4 style={phaseHeaderStyle}>{p}</h4>
            {grouped[p].map((s) => (
              <PhaseRow
                key={s.id}
                cr={cr}
                summary={s}
                showDetails={showDetails}
                verbose={verbose}
              />
            ))}
          </div>
        ))}
    </section>
  )
}

const credentialTitle = (
  cr: App.CredentialVerificationResult,
  index: number
): string => {
  const vc = (cr.verifiableCredential ?? {}) as Record<string, unknown>
  if (typeof vc.name === 'string' && vc.name.length > 0) return vc.name
  const subj = vc.credentialSubject as
    | { achievement?: { name?: string } }
    | undefined
  const achName = subj?.achievement?.name
  if (typeof achName === 'string' && achName.length > 0) return achName
  if (typeof vc.id === 'string' && vc.id.length > 0) return vc.id
  return `Credential ${index + 1}`
}

const cardStyle: CSSProperties = {
  marginTop: '16px',
  padding: '14px 16px',
  borderRadius: '8px',
  border: '1px solid #e5e7eb',
  background: '#ffffff'
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  marginBottom: '12px'
}

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: '1rem',
  fontWeight: 600,
  color: '#111827',
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

const phaseHeaderStyle: CSSProperties = {
  margin: '12px 0 4px',
  fontSize: '0.75rem',
  fontWeight: 500,
  color: '#6b7280'
}

const badgeStyle: CSSProperties = {
  padding: '2px 8px',
  borderRadius: '12px',
  fontSize: '0.7rem',
  background: '#eef2ff',
  color: '#4338ca',
  fontWeight: 600
}

const statusDot = (verified: boolean): CSSProperties => ({
  width: '10px',
  height: '10px',
  borderRadius: '50%',
  flexShrink: 0,
  background: verified ? '#16a34a' : '#dc2626'
})

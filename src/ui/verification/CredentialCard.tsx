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
 *
 * When `issuerValidation` covers this credential, one {@link TrustLine}
 * under the header says whether its issuer is trusted, and by what.
 */
export function CredentialCard({
  cr,
  index,
  showDetails,
  showAll,
  issuerValidation
}: {
  cr: App.CredentialVerificationResult
  index: number
  showDetails: boolean
  showAll: boolean
  issuerValidation?: App.IssuerValidation
}) {
  const grouped = groupByPhase(cr)
  const title = credentialTitle(cr, index)
  const trust = issuerValidation?.credentials.find((c) => c.index === index)

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
      {issuerValidation && trust ? (
        <TrustLine trust={trust} issuerValidation={issuerValidation} />
      ) : null}
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
                showAll={showAll}
              />
            ))}
          </div>
        ))}
    </section>
  )
}

/**
 * One line of issuer trust for a credential.
 *
 * ⚠️ An untrusted issuer is a **warning** (amber), not an error: most
 * issuers are in no registry this service can reach, and the human
 * reading this decides what it means. It is only an error when the
 * exchange set `requireTrustedIssuer`; the error styling carries that it
 * decided the outcome, and the line says only that trust was required.
 * A registry match shows the registry's own name for the issuer, which
 * the credential cannot alter.
 */
function TrustLine({
  trust,
  issuerValidation
}: {
  trust: App.CredentialIssuerValidation
  issuerValidation: App.IssuerValidation
}) {
  if (trust.onAllowlist) {
    return (
      <p data-testid="issuer-trust" style={trustNeutralStyle}>
        Issuer on this exchange's allowlist
      </p>
    )
  }
  const match = trust.registryMatches[0]
  if (match) {
    return (
      <p data-testid="issuer-trust" style={trustNeutralStyle}>
        Listed by <strong>{match.registry}</strong>
        {match.entityName ? (
          <>
            {' '}
            as <strong>{match.entityName}</strong>
          </>
        ) : null}
      </p>
    )
  }
  const consulted = issuerValidation.consultedRegistries
  const required = issuerValidation.requireTrustedIssuer
  return (
    <div
      data-testid="issuer-trust"
      role="status"
      style={required ? trustRequiredStyle : trustWarningStyle}
    >
      <div>
        {consulted.length > 0
          ? `Issuer not found in ${consulted.join(', ')}`
          : 'Issuer not on this exchange’s allowlist, and no registry was consulted'}
      </div>
      {trust.uncheckedRegistries.length > 0 ? (
        <div>Could not check: {trust.uncheckedRegistries.join(', ')}</div>
      ) : null}
      {required ? (
        <div style={{ fontWeight: 600 }}>
          This exchange requires a trusted issuer.
        </div>
      ) : null}
    </div>
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

const trustNeutralStyle: CSSProperties = {
  margin: '0 0 8px',
  fontSize: '0.8125rem',
  color: '#374151'
}

const trustWarningStyle: CSSProperties = {
  margin: '0 0 8px',
  padding: '6px 10px',
  borderRadius: '6px',
  fontSize: '0.8125rem',
  background: '#fffbeb',
  border: '1px solid #fcd34d',
  color: '#92400e'
}

const trustRequiredStyle: CSSProperties = {
  ...trustWarningStyle,
  background: '#fef2f2',
  border: '1px solid #fca5a5',
  color: '#991b1b'
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

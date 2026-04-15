import { Details } from './Details'
import { CheckResultRow } from './CheckResultRow'

export function VerificationResults({
  result,
  features
}: {
  result: App.VerificationResult
  features?: Record<string, string | boolean>
}) {
  const showDetails = features?.details !== false
  const checks = effectiveAllResults(result)
  const salient = salientProblem(checks)
  const overallOk = result.verified

  return (
    <div>
      <div
        style={{
          padding: '24px',
          borderRadius: '8px',
          textAlign: 'center' as const,
          ...(overallOk
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
          {overallOk ? 'Verified' : 'Not verified'}
        </p>
        {overallOk ? (
          <p style={{ margin: 0, fontSize: '0.95rem' }}>
            This presentation passed verification for this exchange.
          </p>
        ) : salient ? (
          <div style={{ textAlign: 'left' as const, marginTop: '12px' }}>
            <p style={{ fontWeight: 600, margin: '0 0 6px' }}>{salient.title}</p>
            {salient.detail ? (
              <p style={{ margin: 0, fontSize: '0.95rem', opacity: 0.95 }}>{salient.detail}</p>
            ) : null}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: '0.95rem' }}>
            Verification did not succeed. See details below if available.
          </p>
        )}
      </div>
      {showDetails && checks.length > 0 ? (
        <Details summary="Details — all checks">
          <div>
            {checks.map((c, i) => (
              <CheckResultRow key={`${c.check}-${c.timestamp}-${i}`} result={c} />
            ))}
          </div>
        </Details>
      ) : null}
    </div>
  )
}

function effectiveAllResults(r: App.VerificationResult): App.CheckResult[] {
  if (Array.isArray(r.allResults) && r.allResults.length > 0) {
    return r.allResults
  }
  const fromCreds = r.credentialResults.flatMap((c) => c.results ?? [])
  return [...(r.presentationResults ?? []), ...fromCreds]
}

function salientProblem(checks: App.CheckResult[]): App.ProblemDetail | null {
  const failures = checks.filter((x) => x.outcome.status === 'failure')
  const fatalFirst = failures.find((x) => x.fatal !== false)
  const pick = fatalFirst ?? failures[0]
  if (!pick || pick.outcome.status !== 'failure') return null
  return pick.outcome.problems[0] ?? null
}

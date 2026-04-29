import type { CSSProperties } from 'react'
import {
  CredentialCard,
  PresentationCard,
  TimingPanel,
  anyTiming
} from './verification'

/**
 * Top-level orchestrator for the verifier-core 2.x verification UI.
 *
 * Renders primarily from `result.summary[]` /
 * `credentialResults[i].summary[]` (the per-suite rollup verifier-core
 * always emits) and lazy-expands into `results[]` for failure detail.
 * Mounts the timing panel only when at least one timing field is
 * present anywhere in `result`. Mounts the compat-log panel only
 * when the exchange was created with `variables.debug === true`.
 *
 * `variables.options.verbose` flips child components into "all
 * checks" detail mode (without it, detail lists show only failures
 * and explicit skips).
 */
export function VerificationResults({
  result,
  features,
  variables
}: {
  result: App.VerificationResult
  features?: Record<string, string | boolean>
  variables?: Pick<App.BaseVariables, 'options' | 'debug'>
}) {
  const showDetails = features?.details !== false
  const verbose = variables?.options?.verbose === true
  const debug = variables?.debug === true

  return (
    <div>
      <PresentationCard result={result} />
      {result.credentialResults.map((cr, i) => (
        <CredentialCard
          key={i}
          cr={cr}
          index={i}
          showDetails={showDetails}
          verbose={verbose}
        />
      ))}
      {anyTiming(result) ? <TimingPanel result={result} /> : null}
      {debug && result.compatLog && result.compatLog.length > 0 ? (
        <CompatLogPanel log={result.compatLog} />
      ) : null}
    </div>
  )
}

/**
 * Tiny inline panel listing compat-fix log entries by id + message.
 * Not extracted to its own file per Phase 5 implementation notes;
 * promote if it grows beyond ~20 lines.
 */
function CompatLogPanel({ log }: { log: App.CheckResult[] }) {
  return (
    <section
      data-testid="compat-log-panel"
      style={{
        marginTop: '16px',
        padding: '12px 14px',
        borderRadius: '8px',
        border: '1px dashed #d1d5db',
        background: '#f9fafb'
      }}
    >
      <p style={panelHeader}>Compatibility fixes applied</p>
      <ul style={listStyle}>
        {log.map((entry, i) => (
          <li key={`${entry.id ?? entry.check}-${i}`} style={itemStyle}>
            <code style={codeStyle}>{entry.id ?? entry.check}</code>
            {entry.outcome.status === 'success' ? (
              <span style={{ color: '#374151' }}> — {entry.outcome.message}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

const panelHeader: CSSProperties = {
  margin: '0 0 8px',
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
  padding: '4px 0',
  fontSize: '0.8125rem'
}

const codeStyle: CSSProperties = {
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '0.8125rem',
  color: '#1f2937'
}

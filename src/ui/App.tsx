import { useState, useEffect, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { wallets } from '../lib/wallets/index.js'
import { WalletInteraction } from './WalletInteraction.js'
import { TerminalView } from './TerminalView.js'
import { useExchangeStatus } from './useExchangeStatus.js'
import type { ExchangeClient } from '../lib/services/exchange-client/exchange-client.js'
import { HttpExchangeClient } from '../lib/services/exchange-client/http-exchange-client.js'

interface AppProps {
  exchangeClient?: ExchangeClient
}

export function App({ exchangeClient }: AppProps) {
  const client = useMemo(
    () => exchangeClient ?? new HttpExchangeClient(),
    [exchangeClient]
  )

  const [protocols, setProtocols] = useState<Record<string, string> | null>(
    null
  )
  const [selectedId, setSelectedId] = useState(wallets[0]?.id ?? '')
  const [fetchError, setFetchError] = useState<string | null>(null)

  const vcapiUrl = protocols?.vcapi ?? null
  const { state, exchange, error: statusError } = useExchangeStatus(
    vcapiUrl,
    client
  )

  useEffect(() => {
    const exchangeId = window.location.pathname.split('/').pop()
    if (!exchangeId) {
      setFetchError('No exchange ID found in URL')
      return
    }

    client
      .fetchProtocols(exchangeId)
      .then(setProtocols)
      .catch((e: Error) => setFetchError(e.message))
  }, [client])

  if (fetchError) {
    return (
      <div style={containerStyle}>
        <h1 style={headingStyle}>Credential Interaction</h1>
        <p style={{ color: '#dc2626' }}>Error: {fetchError}</p>
      </div>
    )
  }

  if (!protocols) {
    return (
      <div style={containerStyle}>
        <h1 style={headingStyle}>Credential Interaction</h1>
        <p>Loading...</p>
      </div>
    )
  }

  if (state === 'complete' || state === 'invalid') {
    return (
      <div style={containerStyle}>
        <h1 style={headingStyle}>Credential Interaction</h1>
        <TerminalView
          state={state}
          workflowId={exchange?.workflowId}
          variables={exchange?.variables}
        />
      </div>
    )
  }

  const rawProtocolIds = Object.keys(protocols).filter(
    (p) => !['iu', 'verifiablePresentationRequest'].includes(p)
  )

  return (
    <div style={containerStyle}>
      <h1 style={headingStyle}>Credential Interaction</h1>

      {statusError && (
        <p style={{ color: '#dc2626', fontSize: '0.875rem' }}>
          Status polling error: {statusError}
        </p>
      )}

      {state && (
        <p style={statusBadgeStyle}>
          Exchange status: <strong>{state}</strong>
        </p>
      )}

      <label style={{ display: 'block', marginBottom: '16px' }}>
        <span style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>
          Select a wallet
        </span>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={selectStyle}
        >
          {wallets.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
          <optgroup label="Advanced">
            {rawProtocolIds.map((p) => (
              <option key={`proto-${p}`} value={p}>
                {p}
              </option>
            ))}
          </optgroup>
        </select>
      </label>

      <WalletInteraction selectedId={selectedId} protocols={protocols} />
    </div>
  )
}

const containerStyle: CSSProperties = {
  maxWidth: '480px',
  margin: '40px auto',
  padding: '24px',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
}

const headingStyle: CSSProperties = {
  fontSize: '1.5rem',
  fontWeight: 700,
  marginBottom: '24px'
}

const selectStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: '1rem',
  borderRadius: '6px',
  border: '1px solid #d1d5db'
}

const statusBadgeStyle: CSSProperties = {
  display: 'inline-block',
  padding: '4px 12px',
  borderRadius: '12px',
  background: '#f3f4f6',
  fontSize: '0.875rem',
  marginBottom: '16px'
}


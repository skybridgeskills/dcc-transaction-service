import { useState, useEffect, useRef, useCallback } from 'react'
import {
  type ExchangeClient,
  type ExchangeState,
  type ExchangeStatusResponse,
  HttpNotOkResponseError
} from '../lib/services/exchange-client/exchange-client'

export interface ExchangeStatusResult {
  state: ExchangeState | null
  /** Full VC-API exchange payload from polling (workflowId, variables, state, …). */
  exchange: ExchangeStatusResponse | null
  loading: boolean
  error: string | null
}

const TERMINAL_STATES: ExchangeState[] = ['complete', 'invalid']
const POLL_INTERVAL_MS = 3000

export function useExchangeStatus(
  vcapiUrl: string | null,
  client: ExchangeClient
): ExchangeStatusResult {
  const [state, setState] = useState<ExchangeState | null>(null)
  const [exchange, setExchange] = useState<ExchangeStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const poll = useCallback(async () => {
    if (!vcapiUrl) return
    try {
      const data = await client.fetchExchangeStatus(vcapiUrl)
      setExchange(data)
      setState(data.state ?? null)
      setError(null)
      setLoading(false)

      if (TERMINAL_STATES.includes(data.state)) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Polling failed')
      // 4xx = unrecoverable; stop polling
      if (
        e instanceof HttpNotOkResponseError &&
        e.status >= 400 &&
        e.status < 500
      ) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    }
  }, [vcapiUrl, client])

  useEffect(() => {
    if (!vcapiUrl) {
      setLoading(false)
      return
    }

    poll()
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [vcapiUrl, poll])

  return { state, exchange, loading, error }
}

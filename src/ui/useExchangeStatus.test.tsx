/**
 * @vitest-environment happy-dom
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useExchangeStatus } from './useExchangeStatus.js'
import { HttpNotOkResponseError } from '../lib/services/exchange-client/exchange-client.js'
import type { ExchangeClient } from '../lib/services/exchange-client/exchange-client.js'

describe('useExchangeStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('stops polling when fetchExchangeStatus returns 4xx', async () => {
    const fetchExchangeStatus = vi
      .fn()
      .mockRejectedValue(new HttpNotOkResponseError('Status 401', 401))
    const client: ExchangeClient = {
      createExchange: vi.fn(),
      fetchProtocols: vi.fn(),
      fetchExchangeStatus
    }

    const { result } = renderHook(() =>
      useExchangeStatus('https://example.com/exchange/123', client)
    )

    await act(async () => {
      vi.advanceTimersByTime(0)
      await Promise.resolve()
    })

    expect(result.current.error).toBe('Status 401')

    const callCountAfterFirstError = fetchExchangeStatus.mock.calls.length
    expect(callCountAfterFirstError).toBeGreaterThanOrEqual(1)

    vi.advanceTimersByTime(15_000)

    await act(async () => {
      await Promise.resolve()
    })

    expect(fetchExchangeStatus).toHaveBeenCalledTimes(callCountAfterFirstError)
  })

  test('stops polling when fetchExchangeStatus returns 400', async () => {
    const fetchExchangeStatus = vi
      .fn()
      .mockRejectedValue(new HttpNotOkResponseError('Status 400', 400))
    const client: ExchangeClient = {
      createExchange: vi.fn(),
      fetchProtocols: vi.fn(),
      fetchExchangeStatus
    }

    const { result } = renderHook(() =>
      useExchangeStatus('https://example.com/exchange/123', client)
    )

    await act(async () => {
      vi.advanceTimersByTime(0)
      await Promise.resolve()
    })

    expect(result.current.error).toBe('Status 400')

    const callCount = fetchExchangeStatus.mock.calls.length
    vi.advanceTimersByTime(10_000)

    await act(async () => {
      await Promise.resolve()
    })

    expect(fetchExchangeStatus).toHaveBeenCalledTimes(callCount)
  })

  test('continues polling on 5xx (recoverable)', async () => {
    const fetchExchangeStatus = vi
      .fn()
      .mockRejectedValue(new HttpNotOkResponseError('Status 500', 500))
    const client: ExchangeClient = {
      createExchange: vi.fn(),
      fetchProtocols: vi.fn(),
      fetchExchangeStatus
    }

    renderHook(() =>
      useExchangeStatus('https://example.com/exchange/123', client)
    )

    await act(async () => {
      vi.advanceTimersByTime(0)
      await Promise.resolve()
    })

    expect(fetchExchangeStatus).toHaveBeenCalled()
    const callCountAfterFirst = fetchExchangeStatus.mock.calls.length

    vi.advanceTimersByTime(10_000)

    await act(async () => {
      await Promise.resolve()
    })

    expect(fetchExchangeStatus.mock.calls.length).toBeGreaterThan(
      callCountAfterFirst
    )
  })

  test('exposes workflowId and variables from fetchExchangeStatus', async () => {
    const fetchExchangeStatus = vi.fn().mockResolvedValue({
      state: 'complete' as const,
      workflowId: 'verify',
      variables: {
        features: { details: true },
        results: { default: { verified: true } }
      }
    })
    const client: ExchangeClient = {
      createExchange: vi.fn(),
      fetchProtocols: vi.fn(),
      fetchExchangeStatus
    }

    const { result } = renderHook(() =>
      useExchangeStatus('https://example.com/exchange/123', client)
    )

    await act(async () => {
      vi.advanceTimersByTime(0)
      await Promise.resolve()
    })

    expect(result.current.exchange?.workflowId).toBe('verify')
    expect(result.current.exchange?.variables?.features).toEqual({
      details: true
    })
    expect(result.current.exchange?.variables?.results).toMatchObject({
      default: { verified: true }
    })
  })
})

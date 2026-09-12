/**
 * Unit tests for the discovery-election recorder.
 *
 * The load-bearing property is the *set*, in fetch order: a client that tries
 * both constructions and a client that takes only the concatenated form have
 * to be distinguishable afterwards, and a single-valued field cannot do it.
 */
import { describe, expect, test } from 'vitest'
import { recordDiscoveryElection } from './discovery-election.js'

const exchange = (
  discoveryElections?: App.DiscoveryElection[]
): App.ExchangeDetailClaim => ({
  tenantName: 'default',
  workflowId: 'claim',
  exchangeId: 'p1-abc',
  expires: new Date(Date.now() + 60_000).toISOString(),
  state: 'pending',
  variables: { challenge: 'chal', exchangeHost: 'https://issuer.example', vc: '{}' },
  ...(discoveryElections ? { discoveryElections } : {})
})

describe('recordDiscoveryElection', () => {
  test('the first election starts the list', () => {
    const { exchange: next, isNew } = recordDiscoveryElection(
      exchange(),
      'oidc-concat',
      'issuer',
      '2026-08-11T00:00:00.000Z'
    )

    expect(isNew).toBe(true)
    expect(next.discoveryElections).toEqual([
      { construction: 'oidc-concat', doc: 'issuer', at: '2026-08-11T00:00:00.000Z' }
    ])
  })

  test('a client that tries both constructions records both, in fetch order', () => {
    // One wallet fetches both; another takes only the concatenation. Those
    // are different observations and the second is only visible as an
    // absence.
    const first = recordDiscoveryElection(
      exchange(),
      'oidc-concat',
      'issuer'
    ).exchange
    const second = recordDiscoveryElection(
      first,
      'rfc8414-path-suffix',
      'issuer'
    ).exchange

    expect(
      second.discoveryElections!.map((e) => e.construction)
    ).toEqual(['oidc-concat', 'rfc8414-path-suffix'])
  })

  test('the same construction for a different document is a distinct election', () => {
    const first = recordDiscoveryElection(exchange(), 'oidc-concat', 'issuer')
      .exchange
    const second = recordDiscoveryElection(first, 'oidc-concat', 'as')

    expect(second.isNew).toBe(true)
    expect(second.exchange.discoveryElections!.map((e) => e.doc)).toEqual([
      'issuer',
      'as'
    ])
  })

  test('a repeat fetch is not appended, and reports nothing to persist', () => {
    // A polling client would otherwise grow the record without bound. Every
    // individual fetch is in the journal, so the repeat is not lost.
    const first = recordDiscoveryElection(exchange(), 'oidc-concat', 'issuer')
      .exchange
    const repeat = recordDiscoveryElection(first, 'oidc-concat', 'issuer')

    expect(repeat.isNew).toBe(false)
    expect(repeat.exchange).toBe(first)
    expect(repeat.exchange.discoveryElections).toHaveLength(1)
  })

  test('does not mutate the exchange it was given', () => {
    const original = exchange()
    recordDiscoveryElection(original, 'oidc-concat', 'issuer')

    expect(original.discoveryElections).toBeUndefined()
  })
})

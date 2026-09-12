/**
 * Unit tests for the interaction-method-election recorder.
 *
 * The load-bearing property is the *set*, in first-election order: an operator
 * who worked down the picker until something rendered, and one who took the
 * first row, have to be distinguishable afterwards, and a single-valued field
 * cannot do it. Same shape as `discovery-election.test.ts`, deliberately.
 */
import { describe, expect, test } from 'vitest'
import { recordInteractionMethodElection } from './interaction-method-election.js'

const AT = '2026-08-25T00:00:00.000Z'
const LATER = '2026-08-25T00:05:00.000Z'

const exchange = (
  interactionMethodElections?: App.InteractionMethodElection[]
): App.ExchangeDetailClaim => ({
  tenantName: 'default',
  workflowId: 'claim',
  exchangeId: 'p1-abc',
  expires: new Date(Date.now() + 60_000).toISOString(),
  state: 'pending',
  variables: {
    challenge: 'chal',
    exchangeHost: 'https://issuer.example',
    vc: '{}'
  },
  ...(interactionMethodElections ? { interactionMethodElections } : {})
})

const election = (
  payloadId: string,
  protocolProfileName: string,
  source: App.InteractionMethodElection['source'] = 'payload'
): Omit<App.InteractionMethodElection, 'at'> => ({ payloadId, protocolProfileName, source })

describe('recordInteractionMethodElection', () => {
  test('the first election starts the list', () => {
    const { exchange: next, isNew } = recordInteractionMethodElection(
      exchange(),
      election('iu', 'profile-a'),
      AT
    )
    expect(isNew).toBe(true)
    expect(next.interactionMethodElections).toEqual([
      { payloadId: 'iu', protocolProfileName: 'profile-a', source: 'payload', at: AT }
    ])
  })

  test('⚠️ two different pairs both appear, in first-election order', () => {
    // "Tried the interaction URL, then OpenID4VP" is the finding. A
    // last-write-wins field would report only the second and lose the sequence.
    const first = recordInteractionMethodElection(exchange(), election('iu', 'profile-a'), AT)
    const second = recordInteractionMethodElection(
      first.exchange,
      election('OID4VP', 'profile-b'),
      LATER
    )
    expect(second.isNew).toBe(true)
    expect(second.exchange.interactionMethodElections!.map((e) => e.payloadId)).toEqual([
      'iu',
      'OID4VP'
    ])
  })

  test('⚠️ the same method under two constructions is two observations', () => {
    // Identity is the PAIR. The whole point of the milestone is retrying one
    // interaction method under a different construction, so collapsing on
    // `payloadId` would erase exactly what it exists to record.
    const first = recordInteractionMethodElection(exchange(), election('iu', 'profile-a'), AT)
    const second = recordInteractionMethodElection(
      first.exchange,
      election('iu', 'profile-b'),
      LATER
    )
    expect(second.isNew).toBe(true)
    expect(second.exchange.interactionMethodElections).toHaveLength(2)
  })

  test('⚠️ a repeat of the same pair is not appended', () => {
    // The page reports on every render, so a poll would otherwise grow an
    // unbounded array on the record. Every individual event is in the journal.
    const first = recordInteractionMethodElection(exchange(), election('iu', 'profile-a'), AT)
    const again = recordInteractionMethodElection(
      first.exchange,
      election('iu', 'profile-a'),
      LATER
    )
    expect(again.isNew).toBe(false)
    expect(again.exchange.interactionMethodElections).toHaveLength(1)
    expect(again.exchange).toBe(first.exchange)
  })

  test('⚠️ the source is part of the record, not part of the identity', () => {
    // `payload` and `active` answer different questions about the same pair; a
    // reader must be able to tell them apart on the record.
    const { exchange: next } = recordInteractionMethodElection(
      exchange(),
      election('iu', 'profile-a', 'active'),
      AT
    )
    expect(next.interactionMethodElections![0]!.source).toBe('active')
  })

  test('pure — the input exchange is not mutated', () => {
    const input = exchange()
    recordInteractionMethodElection(input, election('iu', 'profile-a'), AT)
    expect(input.interactionMethodElections).toBeUndefined()
  })

  test('absent until something is shown, never an empty array', () => {
    expect(exchange().interactionMethodElections).toBeUndefined()
  })
})

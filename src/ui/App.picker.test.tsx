/**
 * @vitest-environment happy-dom
 *
 * The picker shows one entry per DISTINCT PAYLOAD, not one per key.
 *
 * ⚠️ **The rule did not go away, it MOVED to the server.** The envelope carries
 * each construction under more than one spelling — VCALM keeps the deprecated
 * `OID4VP` / `OID4VCI` names indefinitely while advising the versioned ones, so
 * both go out with byte-identical values. Listing both would put two rows in
 * this picker that cannot be told apart by looking at them, so picking the
 * wrong one wastes time. Worse than the wasted time:
 * `interaction-method-shown` would record whichever spelling the operator
 * happened to click, splitting one construction's journal lines across two
 * ids.
 *
 * `protocol-profiles/offerable.ts` applies it now, on the delivered bytes. What
 * this file pins is the half that has to hold in the page: **the rows come from
 * the served presets and are never re-derived from the envelope.** A page that
 * built its own options would reintroduce the defect one layer up.
 */
import { describe, test, expect, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { App } from './App.js'
import { FakeExchangeClient } from '../lib/services/exchange-client/fake-exchange-client.js'
import { PRESETS, PROTOCOLS } from './preset-fixtures.js'

const clientWithBothSpellings = () => {
  window.history.replaceState(null, '', '/interactions/exch-1')
  return new FakeExchangeClient({
    // ⚠️ Both spellings in the envelope; ONE preset for the construction.
    protocols: PROTOCOLS,
    presets: PRESETS,
    states: 'pending'
  })
}

afterEach(cleanup)

const optionLabels = () =>
  screen.getAllByRole('option').map((o) => o.textContent ?? '')

describe('one row per payload', () => {
  test('two spellings of one construction produce ONE option', async () => {
    render(<App exchangeClient={clientWithBothSpellings()} />)
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(0))

    const labels = optionLabels()
    expect(labels.filter((l) => l.startsWith('OpenID4VP'))).toHaveLength(1)
    // ⚠️ And no row is labelled with a raw envelope key at all — the page reads
    // presets, so an envelope key it was never offered cannot appear.
    expect(labels.some((l) => l.includes('oid4vp-1.0'))).toBe(false)
  })

  test('⚠️ the page does not re-derive options from the envelope', async () => {
    // The envelope holds four string keys; the served presets hold ten rows
    // across seven interaction methods. If the page were still building options
    // from `protocols`, the count would follow the envelope.
    render(<App exchangeClient={clientWithBothSpellings()} />)
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(0))

    // Only the `everyone` rows are visible until Advanced is ticked.
    const visible = optionLabels().length
    expect(visible).toBe(PRESETS.filter((p) => p.isDefault && p.payloadId !== 'vcapi').length)
  })

  test('constructions with genuinely different payloads both still appear', async () => {
    render(<App exchangeClient={clientWithBothSpellings()} />)
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(0))

    const labels = optionLabels()
    expect(labels.some((l) => l.startsWith('Interaction URL'))).toBe(true)
    expect(labels.some((l) => l.startsWith('OpenID4VP'))).toBe(true)
  })
})

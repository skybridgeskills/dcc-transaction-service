/**
 * @vitest-environment happy-dom
 *
 * The page reports the interaction method it is showing.
 *
 * ⚠️ This is the acceptance for the QR interaction method-selection hazard: a
 * scan pinned to the wrong interaction method has to be detectable **after the
 * fact from the evidence**, not only in the moment. Without this, the only
 * record that anything went wrong is the operator's memory plus a screenshot
 * of a QR nobody can read. For a by-value OID4VP request there is
 * no `request_uri` GET, so our wire stays completely empty — the page is the
 * only party that knows.
 */
import { describe, test, expect, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { App } from './App.js'
import { FakeExchangeClient } from '../lib/services/exchange-client/fake-exchange-client.js'
import { PRESETS, PROTOCOLS } from './preset-fixtures.js'

const IU = PRESETS.find((p) => p.id === 'iu')!.payload
const OID4VP = PRESETS.find((p) => p.id === 'OID4VP')!.payload

const clientShowing = (search = '') => {
  window.history.replaceState(null, '', `/interactions/exch-1${search}`)
  return new FakeExchangeClient({
    protocols: PROTOCOLS,
    presets: PRESETS,
    states: 'pending'
  })
}

afterEach(cleanup)

describe('the page records which method it showed', () => {
  test('the default candidate is reported, not merely defaulted into', async () => {
    // Candidate A is the default and is the interaction method both runs landed
    // on by accident. It has to leave a line exactly like any other.
    const client = clientShowing()
    render(<App exchangeClient={client} />)

    await waitFor(() => expect(client.interactionMethodsRecorded).toHaveLength(1))
    expect(client.interactionMethodsRecorded[0]).toEqual({
      exchangeId: 'exch-1',
      payloadId: 'iu',
      payload: IU
    })
  })

  test('a pinned `?payload=` is reported as the payload it actually resolves to', async () => {
    const client = clientShowing('?payload=OID4VP')
    render(<App exchangeClient={client} />)

    await waitFor(() => expect(client.interactionMethodsRecorded).toHaveLength(1))
    expect(client.interactionMethodsRecorded[0]!.payloadId).toBe('OID4VP')
    expect(client.interactionMethodsRecorded[0]!.payload).toBe(OID4VP)
  })

  test('the reported payload is the one on screen, byte for byte', async () => {
    // The record and the render read the same resolution, so they cannot
    // disagree about what was scanned.
    const client = clientShowing('?payload=OID4VP')
    render(<App exchangeClient={client} />)

    await waitFor(() => expect(client.interactionMethodsRecorded).toHaveLength(1))
    expect(await screen.findByText(OID4VP)).toBeTruthy()
  })

  test('⚠️ the scheme is legible from the payload itself, not from a derived line', async () => {
    // The derived `openid4vp · by-reference · 246 chars` line is GONE, and the
    // invariant it served survives: the payload string is on screen verbatim, so
    // `openid4vp` versus `https` still settles the question without comparing
    // strings — and it is the bytes rather than a paraphrase of them.
    const client = clientShowing('?payload=OID4VP')
    render(<App exchangeClient={client} />)

    const payload = await screen.findByText(OID4VP)
    expect(payload.textContent!.startsWith('openid4vp://')).toBe(true)
    expect(screen.queryByText(/^openid4vp · /)).toBeNull()
  })

  test('⚠️ the client_id is decoded for an operator, and only there', async () => {
    // ⚠️ Percent-encoded in the payload above, so it cannot be read off the
    // string — which is exactly the rule the decode block follows. An operator
    // arrives from a test case citing an interaction method, so Advanced starts
    // ticked.
    const client = clientShowing('?payload=OID4VP')
    render(<App exchangeClient={client} />)

    const clientId = await screen.findByText(/^redirect_uri:/)
    expect(clientId.textContent).toContain('/openid4vp/response')
  })

  test('⚠️ no rendered text says "method"', async () => {
    // A term of art in `interaction-method-shown`, `describeInteractionMethod`
    // and `payloadId`. It is how the evidence is written, and it never reaches
    // a person holding a phone.
    const client = clientShowing()
    render(<App exchangeClient={client} />)
    await waitFor(() => expect(client.interactionMethodsRecorded).toHaveLength(1))
    expect(document.body.textContent!.toLowerCase()).not.toContain('method')
  })

  test('⚠️ the retired all-caps control caption is gone', async () => {
    // "A CONTROL THAT SHOULD BE REFUSED" described an expected refusal as if it
    // were a defect. It is offered on purpose.
    const client = clientShowing()
    render(<App exchangeClient={client} />)
    await waitFor(() => expect(client.interactionMethodsRecorded).toHaveLength(1))
    expect(document.body.textContent).not.toContain('SHOULD BE REFUSED')
  })
})

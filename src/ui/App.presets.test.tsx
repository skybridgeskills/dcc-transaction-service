/**
 * @vitest-environment happy-dom
 *
 * Concept G's eight rules, as tests.
 *
 * ⚠️ **Each one was a review finding.** They are here so that "simplifying" one
 * away fails rather than merely looks tidier. The reasoning behind each is at
 * its site in `PresetPicker.tsx`.
 */
import { describe, test, expect, afterEach } from 'vitest'
import {
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
  within
} from '@testing-library/react'
import { App } from './App.js'
import { FakeExchangeClient } from '../lib/services/exchange-client/fake-exchange-client.js'
import {
  DROPPED_PIN,
  JWT_PROFILE,
  MANY_PRESETS,
  PRESETS,
  PROTOCOLS,
  VPR_PROFILE
} from './preset-fixtures.js'
import type { LaunchPreset } from './preset-model.js'

const mount = (search = '', presets: LaunchPreset[] = PRESETS) => {
  window.history.replaceState(null, '', `/interactions/exch-1${search}`)
  const client = new FakeExchangeClient({
    protocols: PROTOCOLS,
    presets,
    states: 'pending'
  })
  render(<App exchangeClient={client} />)
  return client
}

const ready = async () =>
  waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(0))

const labels = () => screen.getAllByRole('option').map((o) => o.textContent ?? '')
const advancedCheckbox = () =>
  screen.getByRole('checkbox') as HTMLInputElement
const searchBox = () =>
  screen.getByPlaceholderText(/Search your wallet/) as HTMLInputElement
/**
 * The first row whose text contains `text`.
 *
 * ⚠️ Scoped to the list and taking the FIRST match on purpose: the selected
 * row's label also appears beside the QR, and a base name or a profile name is
 * shared by every row that carries it. The list is in rank order, so the first
 * match is the broadest one — which is the row a reader would tap.
 */
const row = (text: string): HTMLElement =>
  within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .find((r) => (r.textContent ?? '').includes(text))!

afterEach(cleanup)

describe('the two URL parameters', () => {
  test('⚠️ selecting a preset sets BOTH parameters', async () => {
    mount()
    await ready()
    fireEvent.click(advancedCheckbox())
    fireEvent.click(row(JWT_PROFILE))

    const params = new URLSearchParams(window.location.search)
    expect(params.get('payload')).toBe('iu')
    expect(params.get('protocolProfile')).toBe(JWT_PROFILE)
  })

  test('⚠️ the active construction writes NO protocolProfile at all', async () => {
    // Pinning the name of the thing already being served is a name with nothing
    // behind it — the inert-on-default rule, reaching the URL.
    mount('?payload=iu&protocolProfile=' + JWT_PROFILE)
    await ready()
    fireEvent.click(row('Interaction URL'))

    const params = new URLSearchParams(window.location.search)
    expect(params.get('payload')).toBe('iu')
    expect(params.get('protocolProfile')).toBeNull()
  })

  test('⚠️ a URL carrying a pin starts with Advanced ticked', async () => {
    mount(`?payload=iu&protocolProfile=${VPR_PROFILE}`)
    await ready()
    expect(advancedCheckbox().checked).toBe(true)
  })

  test('a URL citing a non-default method starts with Advanced ticked', async () => {
    mount('?payload=OID4VP')
    await ready()
    expect(advancedCheckbox().checked).toBe(true)
  })

  test('⚠️ the page writing `?payload=iu` back does NOT tick Advanced', async () => {
    // The page writes the selected interaction method to the URL, so
    // `?payload=iu` is what a plain user's URL looks like after one render.
    // Treating it as an operator signal would tick Advanced for everybody on
    // their second page load.
    mount('?payload=iu')
    await ready()
    expect(advancedCheckbox().checked).toBe(false)
  })
})

describe('search promotes, it never hides', () => {
  test('⚠️ a partial wallet name is promoted AND every other row survives', async () => {
    // Somebody searches because the thing on screen just failed. Filtering to
    // their wallet removes every alternative at the moment they are needed.
    mount()
    await ready()
    const before = labels().length
    fireEvent.change(searchBox(), { target: { value: 'Learne' } })

    expect(screen.getByText('Best match')).toBeTruthy()
    expect(screen.getByText('Other ways')).toBeTruthy()
    expect(labels().length).toBe(before)
    expect(labels()[0]!).toContain('Learner Credential Wallet')
  })

  test('a description word promotes too', async () => {
    mount()
    await ready()
    fireEvent.change(searchBox(), { target: { value: 'Arizona' } })
    const promoted = labels().slice(0, 2).join(' ')
    expect(promoted).toContain('ASU Pocket')
    expect(promoted).toContain('My Skills Pocket')
  })

  test('⚠️ a wallet not in the table shows the hint, and the list stays complete', async () => {
    mount()
    await ready()
    const before = labels().length
    fireEvent.change(searchBox(), { target: { value: 'Sphereon Wallet' } })

    expect(screen.getByText(/Nothing matches/)).toBeTruthy()
    // ⚠️ Absence is never an error, and the hint points at a row that is still
    // there — the defect an empty list under that hint produced.
    expect(labels().length).toBe(before)
    expect(screen.queryByText('Best match')).toBeNull()
  })
})

describe('the advanced checkbox governs list membership only', () => {
  test('ticking it adds rows in place, and never moves an existing one', async () => {
    mount()
    await ready()
    const before = labels()
    fireEvent.click(advancedCheckbox())
    const after = labels()

    expect(after.length).toBeGreaterThan(before.length)
    // ⚠️ Operator rows are APPENDED, not interleaved: ticking Advanced must
    // never move a row the user was about to tap.
    expect(after.slice(0, before.length)).toEqual(before)
  })

  test('it names how many rows it will add', async () => {
    mount()
    await ready()
    const operatorRows = PRESETS.filter(
      (p) => !p.isDefault || p.payloadId === 'vcapi'
    ).length
    expect(screen.getByText(`(${operatorRows})`)).toBeTruthy()
  })

  test('⚠️ the decode block appears with the same checkbox, beside the QR', async () => {
    // One control, one effect, one place. The disclosure it replaced expanded
    // prose BELOW while adding options ABOVE.
    mount()
    await ready()
    expect(screen.queryByText('payloadId')).toBeNull()
    fireEvent.click(advancedCheckbox())
    expect(screen.getByText('payloadId')).toBeTruthy()
    expect(screen.getByText('candidate')).toBeTruthy()
  })

  test('⚠️ the plain list is unbounded; only the advanced one scrolls', async () => {
    mount('', MANY_PRESETS)
    await ready()
    const list = screen.getByRole('listbox')
    // A scrollbar implies there is more, and for the plain rows there isn't.
    expect(list.style.maxHeight).toBe('')
    fireEvent.click(advancedCheckbox())
    expect(screen.getByRole('listbox').style.overflowY).toBe('auto')
  })
})

describe('the expected refusal and the mismatch refusal', () => {
  test('⚠️ the expected refusal is selectable, not disabled', async () => {
    mount()
    await ready()
    fireEvent.click(advancedCheckbox())
    const control = row('Bare VC-API URL')
    expect(control.hasAttribute('disabled')).toBe(false)
    fireEvent.click(control)
    expect(control.getAttribute('aria-selected')).toBe('true')
  })

  test('it reads as an option, with a calm tag rather than a shout', async () => {
    mount()
    await ready()
    fireEvent.click(advancedCheckbox())
    expect(screen.getByText('expected refusal')).toBeTruthy()
    expect(screen.getByText(/Offered so you can check that it does/)).toBeTruthy()
  })

  test('⚠️ the mismatch refusal fires on a DROPPED pin', async () => {
    // The case the naive check misses, and the silent lie the whole design
    // exists to prevent.
    mount(`?payload=iu&protocolProfile=${VPR_PROFILE}`, [
      PRESETS[0]!,
      DROPPED_PIN
    ])
    await ready()
    expect(screen.getByRole('alert').textContent).toContain(
      'does not match the preset named below'
    )
  })

  test('no refusal when the QR and the row agree', async () => {
    mount()
    await ready()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('⚠️ the decode reports the ACTIVE construction, never the row’s claim', async () => {
    // On a dropped pin the row claims a construction the payload does not
    // carry. Printing that name here would make the decode assert the label
    // `lib/interaction-method.ts` exists to distrust — beside a refusal saying
    // the label is wrong.
    mount(`?payload=iu&protocolProfile=${VPR_PROFILE}`, [
      PRESETS[0]!,
      DROPPED_PIN
    ])
    await ready()
    expect(screen.getByText(/\(active, not pinned\)/).textContent).toContain(
      PRESETS[0]!.protocolProfileName!
    )
    expect(
      screen.getByText(/\(active, not pinned\)/).textContent
    ).not.toContain(VPR_PROFILE)
  })
})

describe('the tried tag', () => {
  test('⚠️ a row already shown is tagged, and the tag is not on the current row', async () => {
    mount()
    await ready()
    fireEvent.click(advancedCheckbox())
    fireEvent.click(row('OpenID4VP'))
    await waitFor(() => expect(screen.getAllByText('tried').length).toBe(1))

    // The interaction URL was shown first, so it carries the tag; the row that
    // is selected does not — it is not a thing you have moved on from.
    expect(row('Interaction URL').textContent).toContain('tried')
  })
})

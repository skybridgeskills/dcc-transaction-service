import { useState, useEffect, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { WalletInteraction } from './WalletInteraction.js'
import { PresetPicker } from './PresetPicker.js'
import { presetViews, type LaunchPreset, type PresetView } from './preset-model.js'
import { TerminalView } from './TerminalView.js'
import { useExchangeStatus } from './useExchangeStatus.js'
import type { ExchangeClient } from '../lib/services/exchange-client/exchange-client.js'
import { HttpExchangeClient } from '../lib/services/exchange-client/http-exchange-client.js'

interface AppProps {
  exchangeClient?: ExchangeClient
}

/**
 * ⚠️ **The URL is the audience discriminator.** A person with a wallet arrives
 * at `/interactions/<id>` with nothing on it; an operator always arrives from a
 * test case, which cites an interaction method — `?payload=OID4VP` — or a
 * construction.
 *
 * ⚠️ **`?payload=iu` does NOT count**, and that is not a special case: the page
 * writes the selected interaction method back to the URL, so `?payload=iu` is
 * what a plain user's URL looks like after one render. Treating it as an
 * operator signal would tick Advanced for everybody on their second page load.
 */
const startsAdvanced = (search: URLSearchParams): boolean =>
  search.get('protocolProfile') !== null ||
  (search.get('payload') !== null && search.get('payload') !== 'iu')

/** The preset a URL's two parameters name, or the first offered. */
const presetFromUrl = (
  views: PresetView[],
  search: URLSearchParams
): PresetView | undefined => {
  const payloadId = search.get('payload')
  const profile = search.get('protocolProfile')
  if (!payloadId) return views[0]
  return (
    views.find(
      (v) =>
        v.preset.payloadId === payloadId &&
        (profile
          ? v.preset.protocolProfileName === profile
          : v.preset.isDefault)
    ) ??
    views.find((v) => v.preset.payloadId === payloadId) ??
    views[0]
  )
}

export function App({ exchangeClient }: AppProps) {
  const client = useMemo(
    () => exchangeClient ?? new HttpExchangeClient(),
    [exchangeClient]
  )

  const [protocols, setProtocols] = useState<Record<string, string> | null>(null)
  const [presets, setPresets] = useState<LaunchPreset[] | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [advanced, setAdvanced] = useState(() =>
    startsAdvanced(new URLSearchParams(window.location.search))
  )
  const [query, setQuery] = useState('')
  /**
   * The rows already shown, rendered back into the list as `tried`.
   *
   * ⚠️ Repeats are not appended — `recordInteractionMethodElection`'s rule — so
   * this and the exchange record's election set agree by construction rather
   * than by being kept in step.
   */
  const [tried, setTried] = useState<string[]>([])

  const views = useMemo(() => (presets ? presetViews(presets) : []), [presets])

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
    // ⚠️ This one is allowed to fail loudly. A page with no presets has nothing
    // to show, so an operator must not be left looking at an empty list
    // wondering whether that is the answer.
    client
      .fetchPresets(exchangeId)
      .then((offered) => {
        // ⚠️ **The URL's selection is adopted in the SAME update as the presets
        // arriving, not in a follow-up effect.** Resolving it a render later
        // meant the page briefly showed — and REPORTED — the first row before
        // switching to the one the URL named, so an operator arriving from a
        // pinned URL left two `interaction-method-shown` lines and the first
        // was wrong.
        setPresets(offered)
        setSelectedId(
          presetFromUrl(
            presetViews(offered),
            new URLSearchParams(window.location.search)
          )?.preset.id ?? null
        )
      })
      .catch((e: Error) => setFetchError(e.message))
  }, [client])

  const selected = views.find((v) => v.preset.id === selectedId) ?? null

  /**
   * What this interaction method serves with no pin — read off the ACTIVE
   * preset for the same interaction method, which is the only place the page
   * holds that fact. See `WalletInteraction`'s prop of the same name for why it
   * is not read off the selected row.
   */
  const activeProfileName =
    views.find(
      (v) =>
        v.preset.payloadId === selected?.preset.payloadId && v.preset.isDefault
    )?.preset.protocolProfileName ?? null

  /**
   * The selection is written back to the URL as the two parameters that already
   * exist, so the page URL itself records what was on screen.
   *
   * This exists because the default was not stable. The selector used to open
   * on the first wallet in the list and now opens on the interaction URL, so a
   * rebuild can silently change which candidate a scan delivers — a receive
   * going out on the `lcw` link while the share that follows goes out on
   * candidate A, with nothing on screen to say so. "Scan the QR on the
   * interaction page" is only a reproducible instruction if the URL names the
   * payload.
   *
   * ⚠️ **`?payload=` is UNCHANGED and `?protocolProfile=` is added beside it.**
   * Orthogonal axes; every test case that cites `?payload=OID4VP` keeps working.
   *
   * ⚠️ **The active construction writes NO `protocolProfile` at all.** Pinning
   * the name of the thing that is already being served would be a name with
   * nothing behind it, and the server treats such a parameter as inert anyway —
   * this is that rule reaching the URL.
   */
  useEffect(() => {
    if (!selected) return
    const url = new URL(window.location.href)
    const profile = selected.preset.isDefault
      ? null
      : selected.preset.protocolProfileName
    if (
      url.searchParams.get('payload') === selected.preset.payloadId &&
      url.searchParams.get('protocolProfile') === profile
    ) {
      return
    }
    url.searchParams.set('payload', selected.preset.payloadId)
    if (profile) url.searchParams.set('protocolProfile', profile)
    else url.searchParams.delete('protocolProfile')
    window.history.replaceState(null, '', url.toString())
  }, [selected])

  /**
   * Report the payload actually on screen, so the journal — which every capture
   * already collects — records the interaction method instead of the operator's
   * memory of it.
   *
   * ⚠️ This is the only channel that can carry it. A by-value OID4VP request
   * puts the whole authorization request in the QR, so there is no
   * `request_uri` GET and a scan that goes nowhere leaves our wire completely
   * empty — so without this report, a scan of the wrong interaction method is
   * invisible until somebody reads the pasted URL afterwards.
   *
   * ⚠️ Reported byte for byte from the SAME preset the QR renders, so the record
   * and the render cannot disagree about what was scanned.
   */
  useEffect(() => {
    if (!selected) return
    const exchangeId = window.location.pathname.split('/').pop()
    if (!exchangeId) return
    void client.recordInteractionMethod(
      exchangeId,
      selected.preset.payloadId,
      selected.preset.payload
    )
    setTried((t) =>
      t.includes(selected.preset.id) ? t : [...t, selected.preset.id]
    )
  }, [client, selected])

  const vcapiUrl = protocols?.vcapi ?? null
  const { state, exchange, error: statusError } = useExchangeStatus(
    vcapiUrl,
    client
  )

  if (fetchError) {
    return (
      <div style={containerStyle}>
        <h1 style={headingStyle}>Credential Interaction</h1>
        <p style={{ color: '#dc2626' }}>Error: {fetchError}</p>
      </div>
    )
  }

  if (!protocols || !presets) {
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

      {selected && (
        <WalletInteraction
          view={selected}
          advanced={advanced}
          activeProfileName={activeProfileName}
        />
      )}

      <PresetPicker
        views={views}
        selectedId={selected?.preset.id ?? ''}
        onSelect={setSelectedId}
        advanced={advanced}
        onAdvancedChange={setAdvanced}
        query={query}
        onQueryChange={setQuery}
        tried={tried}
      />
    </div>
  )
}

/**
 * ⚠️ **The background and the text colour are STATED, not inherited.**
 *
 * Every colour in this page — `#111827` headings, `#6b7280` subtext, the amber
 * negative-control tag, the red mismatch refusal — was chosen against white, and
 * the shell page sets no background at all. On a browser in dark mode the whole
 * page therefore rendered dark text on a dark ground: the heading, the row
 * labels and the search label were all invisible, and the mismatch refusal —
 * the one signal that must never be missed — was the least legible thing on
 * screen.
 *
 * Stating both here is the smallest correct fix and does not touch the design:
 * it makes the assumption the palette already relies on explicit, in the one
 * place that owns the page's frame.
 */
const containerStyle: CSSProperties = {
  maxWidth: '480px',
  margin: '40px auto',
  padding: '24px',
  background: '#fff',
  color: '#111827',
  borderRadius: '10px',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
}

const headingStyle: CSSProperties = {
  fontSize: '1.5rem',
  fontWeight: 700,
  marginBottom: '24px'
}

const statusBadgeStyle: CSSProperties = {
  display: 'inline-block',
  padding: '4px 12px',
  borderRadius: '12px',
  background: '#f3f4f6',
  fontSize: '0.875rem',
  marginBottom: '16px'
}

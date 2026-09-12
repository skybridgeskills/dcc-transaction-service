/**
 * The QR, the payload it carries, and — for an operator — what that payload
 * hides.
 *
 * ⚠️ **The rule for the decode block: decode what the payload HIDES; never
 * paraphrase what it shows.** The scheme and the length are visible in the
 * payload string on screen, so a derived `openid4vp · by-reference · 246 chars`
 * line would be restating something already there. What the string does not show
 * is `client_id` — percent-encoded — and the elected construction, nested one
 * level deeper inside `request_uri`. Those are decoded; nothing else is.
 */
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { describeInteractionMethod } from '../lib/interaction-method.js'
import type { PresetView } from './preset-model.js'

/**
 * Pixel size for a QR carrying `value`.
 *
 * ⚠️ **A fixed 200 px does not scan a by-value OID4VP request.** Those payloads
 * run ~1.4 kB, which needs a version-28-or-denser symbol — roughly 130 modules
 * across, i.e. about 1.5 device pixels per module at 200 px. The scan simply
 * fails, and it fails in the one place that is hardest to debug: with a phone
 * in front of the screen and nothing on the wire to explain it.
 *
 * Short payloads keep the 200 px render they have always had, so no existing
 * candidate's QR changes. Longer ones grow toward 440 px, which holds the
 * densest symbol we emit at ~3.3 px per module. Sized off `value.length`
 * because that is what drives the symbol version; the exact thresholds are a
 * comfort margin, not a spec boundary.
 */
export const qrSizeFor = (value: string): number => {
  if (value.length <= 400) return 200
  if (value.length <= 900) return 320
  return 440
}

/**
 * ⚠️ **Does the QR agree with the row that is highlighted?**
 *
 * A label derived from the *selection* is exactly what
 * `lib/interaction-method.ts` says is not enough. With the derived
 * scheme/length lines gone, a QR that had drifted from the highlighted row
 * would be invisible — so the disagreement surfaces as a REFUSAL rather than as
 * a caption.
 *
 * ⚠️ **The naive check has a blind spot and the asymmetric one is required.**
 * Comparing only when the payload names a profile catches a **wrong** pin and is
 * blind to a **dropped** one — and a dropped pin is the silent lie this whole
 * design exists to prevent: the QR quietly serves the active construction while
 * a test case believes it pinned something else. Nothing on the wire would say
 * so, because an unpinned payload is byte-identical to the active construction
 * by construction, which is what keeps the protocol goldens passing.
 *
 * ⚠️ **Keyed on `isDefault`, never on comparing the name to a default name.**
 * `protocolProfileName` is `null` on the active preset when no layer names a
 * profile, and a name comparison then marks the active row as non-default and
 * fires this refusal on every page load.
 */
export const qrMismatch = (payload: string, preset: PresetView['preset']): boolean => {
  const elected = describeInteractionMethod(payload).protocolProfile
  return preset.isDefault
    ? elected !== undefined
    : elected !== preset.protocolProfileName
}

export function WalletInteraction({
  view,
  advanced,
  activeProfileName
}: {
  view: PresetView
  advanced: boolean
  /**
   * The construction this exchange serves with no pin — from the ACTIVE preset
   * on this interaction method, never from the row that happens to be selected.
   *
   * ⚠️ It is what the decode block reports when the payload names no profile,
   * and reading it off the selected row instead would make the decode assert
   * the row's claim: on a dropped pin it would print the pinned name beside a
   * payload that does not carry it, which is precisely the label
   * `lib/interaction-method.ts` refuses to trust.
   */
  activeProfileName: string | null
}) {
  const payload = view.preset.payload
  const mismatch = qrMismatch(payload, view.preset)

  return (
    <div>
      <div style={{ textAlign: 'center' }}>
        {mismatch && (
          // ⚠️ Loud, to both audiences: "better a 500 nobody can miss than a 200
          // nobody checks", applied to a QR. RED IS RESERVED FOR THIS.
          <p style={mismatchStyle} role="alert">
            ⚠️ This QR does not match the preset named below. Do not scan it —
            reload the page.
          </p>
        )}
        <div style={qrCardStyle}>
          <QRCodeSVG value={payload} size={qrSizeFor(payload)} />
        </div>
        <div style={selectedLabelStyle}>{view.base}</div>
        {view.variant && (
          <div style={selectedVariantStyle}>Variant: {view.variant}</div>
        )}
      </div>

      {/* The payload itself — selectable, so an operator can paste it into a
          run record. */}
      <p style={payloadStyle}>{payload}</p>

      <CopyLink url={payload} />

      {/* ⚠️ The decode sits WITH the QR it describes. It previously appeared
          under a disclosure at the BOTTOM of the page while that same disclosure
          added rows to the list ABOVE — one control with two effects in two
          places. */}
      {advanced && (
        <Decode view={view} activeProfileName={activeProfileName} />
      )}
    </div>
  )
}

/**
 * Copy the payload. ⚠️ Kept for the interaction URL's real use — an operator
 * pasting the link into a phone that cannot scan — and offered for every preset
 * because every one of them is a URL somebody may need to move by hand.
 */
function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    []
  )

  const copy = async () => {
    try {
      // Throws on insecure origins, where `navigator.clipboard` is undefined.
      await navigator.clipboard.writeText(url)
      setCopyFailed(false)
      setCopied(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyFailed(true)
    }
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <button type="button" onClick={copy} style={actionStyle}>
        {copied ? 'Copied' : 'Copy link'}
      </button>
      {copyFailed && (
        <p style={copyHintStyle}>
          Could not reach the clipboard. Select the URL above and copy it
          manually.
        </p>
      )}
    </div>
  )
}

/**
 * What the payload hides, decoded. No paraphrase.
 *
 * ⚠️ `client_id` is the one field that separates candidate A from candidates
 * B/C at a glance (`lib/interaction-method.ts`) and it is percent-encoded in
 * the payload above. The elected construction is nested one level deeper
 * still, inside `request_uri`. Neither can be read off the string; the scheme
 * and the length can, which is why they are gone.
 *
 * ⚠️ **The candidate letter lives HERE**, beside `payloadId` — together they
 * are the short, stable handle an operator has for the payload they just
 * showed. It is not a row label.
 */
function Decode({
  view,
  activeProfileName
}: {
  view: PresetView
  activeProfileName: string | null
}) {
  const method = describeInteractionMethod(view.preset.payload)
  return (
    <dl style={decodeStyle}>
      {view.candidate && (
        <>
          <dt style={dtStyle}>candidate</dt>
          <dd style={ddStyle}>{view.candidate}</dd>
        </>
      )}
      <dt style={dtStyle}>payloadId</dt>
      <dd style={ddStyle}>{view.preset.payloadId}</dd>
      {method.delivery && (
        <>
          <dt style={dtStyle}>delivery</dt>
          <dd style={ddStyle}>{method.delivery}</dd>
        </>
      )}
      {method.clientId && (
        <>
          <dt style={dtStyle}>client_id</dt>
          <dd style={ddStyle}>{method.clientId}</dd>
        </>
      )}
      <dt style={dtStyle}>profile</dt>
      <dd style={ddStyle}>
        {/* ⚠️ Read out of the BYTES when they name one, and labelled "active,
            not pinned" when they do not — the same distinction the exchange
            record draws with `source: 'payload' | 'active'`. */}
        {method.protocolProfile ??
          `${activeProfileName ?? 'service default'} (active, not pinned)`}
      </dd>
    </dl>
  )
}

const mismatchStyle: CSSProperties = {
  margin: '0 0 8px',
  padding: '8px 10px',
  border: '1px solid #fca5a5',
  borderRadius: '6px',
  background: '#fef2f2',
  color: '#b91c1c',
  fontSize: '0.8125rem',
  fontWeight: 600,
  textAlign: 'left'
}
const qrCardStyle: CSSProperties = {
  display: 'inline-block',
  padding: '16px',
  background: '#fff',
  borderRadius: '8px'
}
const selectedLabelStyle: CSSProperties = {
  fontSize: '1.0625rem',
  fontWeight: 600,
  color: '#111827'
}
const selectedVariantStyle: CSSProperties = {
  marginTop: '2px',
  fontSize: '0.875rem',
  color: '#4b5563'
}
const payloadStyle: CSSProperties = {
  margin: '10px 0 12px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.6875rem',
  color: '#6b7280',
  wordBreak: 'break-all',
  userSelect: 'all'
}
const actionStyle: CSSProperties = {
  display: 'inline-block',
  padding: '10px 20px',
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontSize: '1rem',
  fontWeight: 500,
  cursor: 'pointer'
}
const copyHintStyle: CSSProperties = {
  margin: '12px 0 0',
  fontSize: '0.8125rem',
  color: '#6b7280'
}
const decodeStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  columnGap: '10px',
  rowGap: '2px',
  margin: '10px 0 0',
  padding: '10px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
  background: '#fafafa'
}
const dtStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.6875rem',
  color: '#9ca3af'
}
const ddStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.6875rem',
  color: '#374151',
  wordBreak: 'break-all'
}

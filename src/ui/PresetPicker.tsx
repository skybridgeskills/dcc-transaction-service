/**
 * **One list of presets, one search box, one checkbox.**
 *
 * Supersedes the single `<select>` and the interaction method strip + disclosed
 * construction list before it, both of which asked the user to combine two axes
 * they have no reason to hold in their head. A person has a wallet in their
 * hand and wants the thing that works with it.
 *
 * ⚠️ **Every rule below was a review finding. Do not "simplify" one away.**
 * Each carries its own reason inline, and they rhyme: the tidier version
 * costs the user something at the exact moment the thing on screen has just
 * failed them — the alternative it removed, the signal it spent, or the
 * second place it made them look.
 */
import type { CSSProperties } from 'react'
import { searchWallets } from '../lib/wallets/index.js'
import type { PresetView } from './preset-model.js'

export function PresetPicker({
  views,
  selectedId,
  onSelect,
  advanced,
  onAdvancedChange,
  query,
  onQueryChange,
  tried
}: {
  views: PresetView[]
  selectedId: string
  onSelect: (id: string) => void
  advanced: boolean
  onAdvancedChange: (next: boolean) => void
  query: string
  onQueryChange: (next: string) => void
  /** The exchange record's election set, rendered back INTO the list. */
  tried: string[]
}) {
  const trimmed = query.trim()
  const matchedWallets = trimmed ? searchWallets(trimmed) : []

  /**
   * ⚠️ **Search PROMOTES; it never hides.**
   *
   * Filtering felt right and is wrong here. Somebody searches *because the thing
   * on screen just failed* — so a search for `LCW` that leaves only the LCW row
   * has removed every alternative at the exact moment they are needed. And a
   * search that matched nothing left an empty list under a hint pointing at a
   * row that was no longer there.
   */
  const matches = (view: PresetView): boolean => {
    if (!trimmed) return false
    const needle = trimmed.toLowerCase()
    const haystack = [
      view.base,
      view.variant ?? '',
      view.subtext ?? '',
      view.preset.protocolProfileName ?? '',
      ...view.worksWith
    ]
      .join(' ')
      .toLowerCase()
    if (haystack.includes(needle)) return true
    // A wallet-name hit pulls in every preset that product is recorded against.
    return matchedWallets.some(
      (w) =>
        view.preset.productIds.includes(w.id) || view.preset.payloadId === w.id
    )
  }

  const inScope = views.filter((v) => v.audience !== 'operator' || advanced)
  const promoted = inScope.filter(matches)
  const rest = inScope.filter((v) => !matches(v))
  const operatorCount = views.filter((v) => v.audience === 'operator').length

  return (
    <>
      <label style={{ display: 'block', marginTop: '16px' }}>
        <span style={labelTextStyle}>Not working? Pick another way</span>
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search your wallet’s name, or a preset"
          style={inputStyle}
        />
      </label>

      {/*
        ⚠️ A CHECKBOX, directly above the list, governing LIST MEMBERSHIP ONLY.
        The disclosure it replaced expanded prose *below* while adding options
        *above* — one control, two effects, two places.
      */}
      <label style={checkboxRowStyle}>
        <input
          type="checkbox"
          checked={advanced}
          onChange={(e) => onAdvancedChange(e.target.checked)}
        />
        <span>
          Include advanced options{' '}
          <span style={{ color: '#9ca3af' }}>({operatorCount})</span>
        </span>
      </label>

      {trimmed && promoted.length === 0 && (
        // ⚠️ Absence is never an error — and it is now distinguishable from "you
        // have not finished typing", because the search matches prefixes,
        // substrings and descriptions.
        <p style={hintStyle}>
          Nothing matches <strong>{trimmed}</strong>. Most wallets aren’t in our
          list, and that’s fine — the first one below works with most of them.
        </p>
      )}

      {/*
        ⚠️ Bounded ONLY with Advanced ticked. The plain rows must never scroll —
        a scrollbar implies there is more, and for them there isn't. The
        operator's rows would otherwise push the QR off screen, and the QR is the
        thing being scanned.
      */}
      <div
        role="listbox"
        aria-label="Presets"
        style={{
          ...listStyle,
          ...(advanced ? { maxHeight: '380px', overflowY: 'auto' } : {})
        }}
      >
        {promoted.length > 0 && <div style={groupHeadingStyle}>Best match</div>}
        {[...promoted, ...rest].map((view, i) => {
          const startsRest = promoted.length > 0 && i === promoted.length
          const on = view.preset.id === selectedId
          const wasTried = tried.includes(view.preset.id) && !on
          return (
            <div key={view.preset.id}>
              {startsRest && <div style={groupHeadingStyle}>Other ways</div>}
              <button
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => onSelect(view.preset.id)}
                style={{ ...rowStyle, ...(on ? rowOnStyle : {}) }}
              >
                <div style={rowTopStyle}>
                  <span style={rowLabelStyle}>{view.base}</span>
                  <span style={{ display: 'flex', gap: '6px' }}>
                    {view.expectedRefusal && (
                      // ⚠️ A calm amber tag. RED IS RESERVED for the QR/preset
                      // mismatch, which is a genuine failure; spending it on a
                      // deliberate refusal dilutes the one signal that must
                      // never be ignored.
                      <span style={refusalTagStyle}>expected refusal</span>
                    )}
                    {/* ⚠️ The election set, rendered back INTO the list rather
                        than beside it, so "tried both" is visible without a
                        second panel. Repeats are not appended, so the tag and
                        the record agree by construction. */}
                    {wasTried && <span style={triedTagStyle}>tried</span>}
                  </span>
                </div>
                {view.variant && (
                  <div style={variantStyle}>Variant: {view.variant}</div>
                )}
                {view.subtext && <div style={subtextStyle}>{view.subtext}</div>}
                {view.worksWith.length > 0 && (
                  <div style={subtextStyle}>
                    Works with {view.worksWith.join(', ')}
                  </div>
                )}
                {/* ⚠️ The full flat profile name — the citable identity a test
                    case copies — only under advanced options. */}
                {advanced && !view.preset.isDefault && (
                  <div style={profileNameStyle}>
                    {view.preset.protocolProfileName}
                  </div>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}

const labelTextStyle: CSSProperties = {
  display: 'block',
  marginBottom: '4px',
  fontWeight: 500,
  fontSize: '0.875rem'
}
const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 12px',
  fontSize: '0.9375rem',
  borderRadius: '6px',
  border: '1px solid #d1d5db'
}
const checkboxRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginTop: '10px',
  fontSize: '0.8125rem',
  color: '#4b5563',
  cursor: 'pointer'
}
const hintStyle: CSSProperties = {
  margin: '8px 0 0',
  fontSize: '0.8125rem',
  color: '#4b5563'
}
const groupHeadingStyle: CSSProperties = {
  padding: '6px 12px',
  background: '#f9fafb',
  borderBottom: '1px solid #f3f4f6',
  fontSize: '0.6875rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#9ca3af'
}
const listStyle: CSSProperties = {
  marginTop: '10px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  overflow: 'hidden'
}
const rowStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '10px 12px',
  border: 'none',
  borderBottom: '1px solid #f3f4f6',
  background: '#fff',
  cursor: 'pointer'
}
const rowOnStyle: CSSProperties = {
  background: '#eff6ff',
  boxShadow: 'inset 3px 0 0 #2563eb'
}
const rowTopStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '8px',
  justifyContent: 'space-between'
}
const rowLabelStyle: CSSProperties = {
  fontSize: '0.9375rem',
  fontWeight: 600,
  color: '#111827'
}
const variantStyle: CSSProperties = {
  marginTop: '2px',
  fontSize: '0.8125rem',
  color: '#374151'
}
const subtextStyle: CSSProperties = {
  marginTop: '2px',
  fontSize: '0.8125rem',
  color: '#6b7280'
}
const refusalTagStyle: CSSProperties = {
  fontSize: '0.6875rem',
  color: '#92400e',
  background: '#fffbeb',
  border: '1px solid #fde68a',
  borderRadius: '999px',
  padding: '1px 8px',
  whiteSpace: 'nowrap'
}
const triedTagStyle: CSSProperties = {
  fontSize: '0.6875rem',
  color: '#6b7280',
  background: '#f3f4f6',
  borderRadius: '999px',
  padding: '1px 8px',
  whiteSpace: 'nowrap'
}
const profileNameStyle: CSSProperties = {
  marginTop: '4px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.6875rem',
  color: '#4b5563',
  wordBreak: 'break-word'
}

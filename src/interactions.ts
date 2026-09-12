import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { getExchangeDataById } from './transactionManager.js'
import { getProtocols } from './exchanges.js'
import { signExchangeToken } from './lib/server/exchangeToken.js'
import { sweepIfTimedOut } from './lib/verify-task/sweep-verify-task.js'
import { electedProfileExchange } from './protocol-profiles/election.js'

/**
 * Determines whether the request prefers an HTML response based on the Accept header.
 *
 * Returns true (HTML) when:
 *   - Accept includes text/html
 *   - Accept includes wildcard but does NOT include application/json
 * Returns false (JSON) otherwise, including when Accept is missing.
 */
export const prefersHtml = (accept: string | undefined): boolean => {
  if (!accept) return false
  if (accept.includes('text/html')) return true
  if (accept.includes('*/*') && !accept.includes('application/json'))
    return true
  return false
}

const uiDir = import.meta.dirname ?? new URL('.', import.meta.url).pathname
const uiHtmlDistPath = resolve(uiDir, '../dist/ui/index.html')
/** Vite source entry; used when `dist/ui` has not been built (e.g. unit tests). */
const uiHtmlSrcPath = resolve(uiDir, 'ui/index.html')

let cachedHtml: string | null = null

const getUiHtml = async (): Promise<string> => {
  if (!cachedHtml) {
    try {
      cachedHtml = await readFile(uiHtmlDistPath, 'utf-8')
    } catch (e) {
      const err = e as NodeJS.ErrnoException
      if (err.code !== 'ENOENT') throw e
      cachedHtml = await readFile(uiHtmlSrcPath, 'utf-8')
    }
  }
  return cachedHtml
}

export type InteractionResult =
  | { kind: 'html'; html: string; token: string; maxAge: number }
  | { kind: 'json'; protocols: ReturnType<typeof getProtocols> }

/**
 * Resolve what an interaction request should be answered with.
 *
 * @param electedProtocolProfileName the render-time election carried on the
 * fetched URL as `?protocolProfile=`, when one is present.
 *
 * ⚠️ **The HTML branch ignores it, deliberately.** The shell page carries no
 * construction at all — the SPA reads the parameter out of `window.location`
 * itself and asks for the payloads it needs. Applying an election to a page that
 * emits no wallet-facing bytes would be a second place the election is honoured,
 * with nothing to honour.
 *
 * ⚠️ **This is the interaction method the VPR-differential profiles ride on.**
 * A wallet fetching the interaction URL with the parameter gets its
 * `verifiablePresentationRequest` built under that profile, which is the only
 * way `vcapi-vpr-bare-origin-domain` and its siblings are selectable at all —
 * they change no OID4VP byte, so on the `openid4vp://` interaction method they
 * are the default.
 */
export const resolveInteraction = async (
  exchangeId: string,
  accept: string | undefined,
  config: App.Config,
  electedProtocolProfileName?: string
): Promise<InteractionResult> => {
  if (prefersHtml(accept)) {
    // The HTML branch returns a shell page + token; the actual
    // exchange JSON is fetched by the SPA on a follow-up request, so
    // there is no need to sweep here. (The follow-up request goes
    // through the JSON branch / GET state route, which does sweep.)
    const exchangeData = await getExchangeDataById(exchangeId)
    const token = await signExchangeToken({
      exchangeId: exchangeData.exchangeId,
      workflowId: exchangeData.workflowId,
      expiresAt: exchangeData.expires
    })
    const maxAge = Math.floor(
      (new Date(exchangeData.expires).getTime() - Date.now()) / 1000
    )
    const html = await getUiHtml()
    return { kind: 'html', html, token, maxAge }
  }

  const loaded = await getExchangeDataById(exchangeId)
  const exchangeData = await sweepIfTimedOut(loaded, config)
  // ⚠️ A COPY, built after the sweep and never persisted. `sweepIfTimedOut` may
  // write the exchange back; the elected copy is made from what it returns, so
  // the election cannot ride along on that write. See `electedProfileExchange`.
  const forBytes = electedProtocolProfileName
    ? electedProfileExchange(exchangeData, electedProtocolProfileName, config)
    : exchangeData
  // ⚠️ **The pin is applied here and NOT passed on into the envelope**, and the
  // difference matters. An election rides on the URL that is fetched: this URL
  // carried one, so this response is built under it. The `request_uri` inside
  // the envelope is a DIFFERENT fetched URL, it carries no pin, and it therefore
  // serves this exchange's own construction — which is what its own absence of a
  // pin says. Copying the pin down would make the parameter mean "and everything
  // reachable from here", and pinning the default's own name would then stop
  // being byte-identical to no parameter at all.
  //
  // A wallet that wants the elected construction on the OID4VP interaction
  // method scans the OID4VP preset, whose deep link carries the pin inside its
  // own `request_uri`.
  const protocols = getProtocols(forBytes)
  return { kind: 'json', protocols }
}

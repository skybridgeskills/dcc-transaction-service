import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { getExchangeDataById } from './transactionManager.js'
import { getProtocols } from './exchanges.js'
import { signExchangeToken } from './lib/server/exchangeToken.js'
import { sweepIfTimedOut } from './lib/verify-task/sweep-verify-task.js'

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

export const resolveInteraction = async (
  exchangeId: string,
  accept: string | undefined,
  config: App.Config
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
  const protocols = getProtocols(exchangeData)
  return { kind: 'json', protocols }
}

import type { Context } from 'hono'
import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { getExchangeDataById } from './transactionManager.js'
import { getProtocols } from './exchanges.js'

/**
 * Determines whether the request prefers an HTML response based on the Accept header.
 *
 * Returns true (HTML) when:
 *   - Accept includes text/html
 *   - Accept includes *​/* but does NOT include application/json
 * Returns false (JSON) otherwise, including when Accept is missing.
 */
export const prefersHtml = (accept: string | undefined): boolean => {
  if (!accept) return false
  if (accept.includes('text/html')) return true
  if (accept.includes('*/*') && !accept.includes('application/json')) return true
  return false
}

const uiHtmlPath = resolve(
  import.meta.dirname ?? new URL('.', import.meta.url).pathname,
  '../dist/ui/index.html'
)

let cachedHtml: string | null = null

const getUiHtml = async (): Promise<string> => {
  if (!cachedHtml) {
    cachedHtml = await readFile(uiHtmlPath, 'utf-8')
  }
  return cachedHtml
}

export const handleInteraction = async (c: Context) => {
  const accept = c.req.header('accept')

  if (prefersHtml(accept)) {
    const html = await getUiHtml()
    return c.html(html)
  }

  const exchangeData = await getExchangeDataById(c.req.param('exchangeId'))
  const protocols = getProtocols(exchangeData)
  return c.json({ protocols })
}

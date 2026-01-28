/**
 * Test helpers for creating SvelteKit RequestEvent objects and calling endpoints
 */

import type { RequestEvent } from '@sveltejs/kit'
import type { AppContext } from '../lib/app/app-types.js'
import { runInAppContext } from '../lib/app/app-context.js'

export interface CreateRequestEventOptions<
  TParams extends Record<string, string> = Record<string, string>,
  TRouteId extends string | null = string | null
> {
  url: string
  method?: string
  body?: unknown
  params?: TParams
  headers?: Record<string, string>
  ctx: AppContext
  authTenant?: App.Tenant
  routeId?: TRouteId
}

/**
 * Creates a SvelteKit RequestEvent for testing
 *
 * @template TParams - The params type (inferred from params option)
 * @template TRouteId - The route ID type (optional, defaults to null)
 */
export function createRequestEvent<
  TParams extends Record<string, string> = Record<string, string>,
  TRouteId extends string | null = string | null
>(
  options: CreateRequestEventOptions<TParams, TRouteId>
): RequestEvent<TParams, any> {
  const {
    url,
    method = 'GET',
    body,
    params = {} as TParams,
    headers = {},
    ctx,
    authTenant,
    routeId = null as TRouteId
  } = options

  // Create Request object
  const requestInit: RequestInit = {
    method,
    headers: {
      ...headers,
      ...(body
        ? { 'Content-Type': headers['Content-Type'] || 'application/json' }
        : {})
    }
  }

  if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
    // Only set Content-Type if we have a body
    if (!requestInit.headers) {
      requestInit.headers = {}
    }

    if (typeof body === 'string') {
      requestInit.body = body
    } else {
      requestInit.body = JSON.stringify(body)
    }
  } else if (method !== 'GET' && method !== 'HEAD' && body === undefined) {
    // For POST/PUT/etc with no body, don't set Content-Type
    // This allows the server to detect empty body
  }

  // Convert relative URLs to absolute URLs for Request constructor
  const absoluteUrl =
    url.startsWith('http://') || url.startsWith('https://')
      ? url
      : `http://localhost${url.startsWith('/') ? '' : '/'}${url}`

  const request = new Request(absoluteUrl, requestInit)

  // Create RequestEvent-like object
  // Note: SvelteKit's RequestEvent has more properties, but we only need the ones our handlers use
  const event = {
    request,
    params: params as TParams,
    locals: {
      ctx,
      authTenant
    },
    url: new URL(absoluteUrl),
    route: { id: routeId },
    isDataRequest: false,
    isSubRequest: false,
    platform: undefined,
    getClientAddress: () => '127.0.0.1',
    cookies: {
      get: () => undefined,
      set: () => {},
      delete: () => {},
      has: () => false,
      serialize: () => '',
      getAll: () => []
    },
    fetch: globalThis.fetch,
    setHeaders: () => {},
    depends: () => {},
    parent: async () => ({}),
    waitUntil: () => {}
  } as unknown as RequestEvent<TParams, any>

  return event
}

/**
 * Calls a SvelteKit endpoint handler and returns the Response
 * Runs the handler within the app context from the event
 * Catches SvelteKit errors and converts them to Response objects
 *
 * @template TEvent - The RequestEvent type (inferred from handler)
 */
export async function callEndpoint<TEvent extends RequestEvent<any, any>>(
  handler: (event: TEvent) => Promise<Response> | Response,
  event: RequestEvent<any, any>
): Promise<Response> {
  try {
    return await runInAppContext(event.locals.ctx, async () => {
      return handler(event as TEvent)
    })
  } catch (e: any) {
    // SvelteKit's error() function throws an HttpError
    // Convert it to a Response object for testing
    if (e && typeof e.status === 'number') {
      const status = e.status
      const body = e.body || { message: e.message || 'Error' }
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    // Re-throw if it's not an HttpError
    throw e
  }
}

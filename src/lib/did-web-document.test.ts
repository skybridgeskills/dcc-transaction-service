import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import axios from 'axios'
import {
  DidWebDocumentUnavailableError,
  clearDidWebDocumentCache,
  didWebDocumentPath,
  didWebDocumentRoutes,
  fetchDidWebDocument,
  resolveDidWebDocumentRoute,
  signingServiceDidDocumentUrl
} from './did-web-document.js'

const configWith = (
  tenants: Record<string, App.Tenant>,
  signingService = 'http://signing.test'
): App.Config =>
  ({ tenants, signingService }) as unknown as App.Config

const exampleTenant: Record<string, App.Tenant> = {
  example: {
    tenantName: 'example',
    tenantToken: 'token',
    issuerInstances: [
      {
        id: 'did:web:example.com:ui:example-tenant',
        cryptosuite: 'eddsa-rdfc-2022',
        signingServiceTenant: 'example-tenant'
      }
    ]
  }
}

beforeEach(() => {
  clearDidWebDocumentCache()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('didWebDocumentPath', () => {
  test('maps a path-form did:web to its resolution path', () => {
    expect(didWebDocumentPath('did:web:example.com:ui:example-tenant')).toBe(
      '/ui/example-tenant/did.json'
    )
  })

  test('percent-decodes each path segment, per the did:web method', () => {
    expect(didWebDocumentPath('did:web:example.com:ui:a%20b')).toBe(
      '/ui/a b/did.json'
    )
  })

  test('declines a bare-domain did:web, whose document is a .well-known', () => {
    // Out of scope by decision, not by oversight: the identifier in use is
    // path-form, and a bare-domain document would need a route outside `/ui/*`.
    expect(didWebDocumentPath('did:web:example.com')).toBeUndefined()
  })

  test('declines a non-did:web identifier', () => {
    expect(didWebDocumentPath('did:key:z6Mk...')).toBeUndefined()
  })
})

describe('didWebDocumentRoutes', () => {
  test('derives the path and signing tenant from issuerInstances alone', () => {
    // The point of the assertion: no `example-tenant` literal anywhere in
    // config other than the issuer instance that issuing already needs.
    // Hosting follows from issuing being configured.
    expect(didWebDocumentRoutes(configWith(exampleTenant))).toEqual([
      {
        didWebId: 'did:web:example.com:ui:example-tenant',
        signingServiceTenant: 'example-tenant',
        path: '/ui/example-tenant/did.json'
      }
    ])
  })

  test('ignores did:key issuer instances', () => {
    const routes = didWebDocumentRoutes(
      configWith({
        k: {
          tenantName: 'k',
          tenantToken: 't',
          issuerInstances: [
            {
              id: 'did:key:z6MkTest',
              cryptosuite: 'eddsa-rdfc-2022',
              signingServiceTenant: 'k'
            }
          ]
        }
      })
    )
    expect(routes).toEqual([])
  })

  test('is empty for tenants with no issuer instances', () => {
    expect(
      didWebDocumentRoutes(
        configWith({ legacy: { tenantName: 'legacy', tenantToken: 't' } })
      )
    ).toEqual([])
  })
})

describe('resolveDidWebDocumentRoute', () => {
  test('matches the configured path', () => {
    expect(
      resolveDidWebDocumentRoute(
        '/ui/example-tenant/did.json',
        configWith(exampleTenant)
      )?.signingServiceTenant
    ).toBe('example-tenant')
  })

  test('does not match other paths under /ui', () => {
    const config = configWith(exampleTenant)
    expect(resolveDidWebDocumentRoute('/ui/index.html', config)).toBeUndefined()
    expect(
      resolveDidWebDocumentRoute('/ui/other/did.json', config)
    ).toBeUndefined()
    expect(
      resolveDidWebDocumentRoute('/ui/example-tenant/assets/app.js', config)
    ).toBeUndefined()
  })
})

describe('fetchDidWebDocument', () => {
  const config = configWith(exampleTenant)
  const route = didWebDocumentRoutes(config)[0]
  const document = {
    id: 'did:web:example.com:ui:example-tenant',
    assertionMethod: [{ publicKeyMultibase: 'z6Mkfake' }]
  }

  test('asks the signing service for the tenant document', async () => {
    const get = vi
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: document } as never)

    await expect(fetchDidWebDocument(route, config)).resolves.toEqual(document)
    expect(get).toHaveBeenCalledWith(
      'http://signing.test/instance/example-tenant/did.json'
    )
    expect(signingServiceDidDocumentUrl(config, 'example-tenant')).toBe(
      'http://signing.test/instance/example-tenant/did.json'
    )
  })

  test('serves a second request from cache', async () => {
    const get = vi
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: document } as never)

    await fetchDidWebDocument(route, config, 1_000)
    await fetchDidWebDocument(route, config, 2_000)
    expect(get).toHaveBeenCalledTimes(1)
  })

  test('refetches once the short TTL has passed', async () => {
    const get = vi
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: document } as never)

    await fetchDidWebDocument(route, config, 1_000)
    await fetchDidWebDocument(route, config, 1_000 + 60_001)
    expect(get).toHaveBeenCalledTimes(2)
  })

  test('does not cache a failure — an outage stays visible', async () => {
    const get = vi
      .spyOn(axios, 'get')
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue({ data: document } as never)

    await expect(fetchDidWebDocument(route, config)).rejects.toBeInstanceOf(
      DidWebDocumentUnavailableError
    )
    await expect(fetchDidWebDocument(route, config)).resolves.toEqual(document)
    expect(get).toHaveBeenCalledTimes(2)
  })

  test('names the DID, the URL and the env vars in its failure message', async () => {
    // A legible 502 is the deliverable here: whoever reads it must be able to
    // tell a mis-set SIGNING_SERVICE from a mis-set TENANT_DIDMETHOD_* without
    // opening a debugger.
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('connect ECONNREFUSED'))

    await expect(fetchDidWebDocument(route, config)).rejects.toThrow(
      /did:web:example\.com:ui:example-tenant/
    )
    await expect(fetchDidWebDocument(route, config)).rejects.toThrow(
      /http:\/\/signing\.test\/instance\/example-tenant\/did\.json/
    )
    await expect(fetchDidWebDocument(route, config)).rejects.toThrow(
      /TENANT_DIDMETHOD_EXAMPLE-TENANT=web/
    )
  })

  test('rejects a non-object body rather than publishing it', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: 'not a document' } as never)

    await expect(fetchDidWebDocument(route, config)).rejects.toBeInstanceOf(
      DidWebDocumentUnavailableError
    )
  })
})

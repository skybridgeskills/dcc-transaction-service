/**
 * Hono integration tests for `did:web` document hosting.
 *
 * The load-bearing one is "is not shadowed by the `/ui/*` static mount". A
 * path-form `did:web` identifier resolves *inside* the directory `serveStatic`
 * serves, and `pnpm dev` runs `vite build` with `emptyOutDir: true` — so the
 * obvious implementation (drop a `did.json` into `dist/ui/`) works exactly
 * until the next build and then stops, silently, with the issuer's DID
 * becoming unresolvable. These tests plant a decoy file in that very location
 * and assert the route wins.
 */
import {
  describe,
  expect,
  test,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi
} from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axios from 'axios'
import { app } from './hono.js'
import * as config from './config.js'
import { clearDidWebDocumentCache } from './lib/did-web-document.js'

/** Unique so the test never touches a real UI asset directory. */
const TENANT_SEGMENT = `didwebtest-${process.pid}`
const DID = `did:web:example.com:ui:${TENANT_SEGMENT}`
const DOCUMENT_PATH = `/ui/${TENANT_SEGMENT}/did.json`
const SIGNING_SERVICE = 'http://signing.test'

/**
 * What the signing service derives. Shape matters to whoever asserts on it:
 * `@interop/did-web-resolver` embeds the key under `assertionMethod` and emits
 * no top-level `verificationMethod` array.
 */
const DERIVED_DOCUMENT = {
  '@context': [
    'https://www.w3.org/ns/did/v1',
    'https://w3id.org/security/suites/ed25519-2020/v1',
    'https://w3id.org/security/suites/x25519-2020/v1'
  ],
  id: DID,
  assertionMethod: [
    {
      id: `${DID}#z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q`,
      type: 'Ed25519VerificationKey2020',
      controller: DID,
      publicKeyMultibase: 'z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q'
    }
  ]
}

/** The file a `vite build` would delete — and that must never be served. */
const DECOY = { id: 'did:web:example.invalid:stale:copy' }

const staticDirectory = join(process.cwd(), 'dist', 'ui', TENANT_SEGMENT)

beforeAll(async () => {
  await mkdir(staticDirectory, { recursive: true })
  await writeFile(join(staticDirectory, 'did.json'), JSON.stringify(DECOY))
  await writeFile(
    join(staticDirectory, 'app.js'),
    'export const stillServedStatically = true\n'
  )
})

afterAll(async () => {
  await rm(staticDirectory, { recursive: true, force: true })
})

beforeEach(() => {
  clearDidWebDocumentCache()
  const current = config.getConfig()
  vi.spyOn(config, 'getConfig').mockImplementation(() => ({
    ...current,
    signingService: SIGNING_SERVICE,
    tenants: {
      example: {
        tenantName: 'example',
        tenantToken: 'token',
        issuerInstances: [
          {
            id: DID,
            cryptosuite: 'eddsa-rdfc-2022',
            signingServiceTenant: TENANT_SEGMENT
          }
        ]
      }
    }
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /ui/:tenant/did.json', () => {
  test('serves the document the signing service derives', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: DERIVED_DOCUMENT
    } as never)

    const response = await app.request(DOCUMENT_PATH)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual(DERIVED_DOCUMENT)
  })

  test('asks the signing service for the tenant derived from config', async () => {
    const get = vi
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: DERIVED_DOCUMENT } as never)

    await app.request(DOCUMENT_PATH)

    expect(get).toHaveBeenCalledWith(
      `${SIGNING_SERVICE}/instance/${TENANT_SEGMENT}/did.json`
    )
  })

  test('is not shadowed by the /ui/* static mount', async () => {
    // A real `did.json` exists on disk at exactly this path (see beforeAll).
    // If the route were registered after `serveStatic`, this test would return
    // the decoy — and in production it would return whatever survived the last
    // `vite build`, which is nothing.
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: DERIVED_DOCUMENT
    } as never)

    const body = (await (await app.request(DOCUMENT_PATH)).json()) as {
      id: string
    }

    expect(body.id).toBe(DID)
    expect(body.id).not.toBe(DECOY.id)
  })

  test('leaves every other path under /ui to the static mount', async () => {
    // The other half of the ordering constraint: intercepting `/ui/*` must not
    // cost us the UI. Anything that is not a configured DID document falls
    // through untouched.
    const get = vi.spyOn(axios, 'get')

    const response = await app.request(`/ui/${TENANT_SEGMENT}/app.js`)

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('stillServedStatically')
    expect(get).not.toHaveBeenCalled()
  })

  test('a signing-service outage is a 502 with a legible message', async () => {
    // Not a 500: this service is healthy and its upstream is not, and the
    // message below is what makes that difference nameable.
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('connect ECONNREFUSED'))

    const response = await app.request(DOCUMENT_PATH)
    const body = (await response.json()) as { code: number; message: string }

    expect(response.status).toBe(502)
    expect(body.code).toBe(502)
    expect(body.message).toContain(DID)
    expect(body.message).toContain(
      `${SIGNING_SERVICE}/instance/${TENANT_SEGMENT}/did.json`
    )
    expect(body.message).toContain('SIGNING_SERVICE')
  })

  test('a did.json for an unconfigured tenant is not invented', async () => {
    const get = vi.spyOn(axios, 'get')

    const response = await app.request('/ui/not-a-tenant/did.json')

    expect(response.status).toBe(404)
    expect(get).not.toHaveBeenCalled()
  })
})

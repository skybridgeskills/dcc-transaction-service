import type { EntityIdentityRegistry } from '@digitalcredentials/verifier-core'
import Keyv from 'keyv'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const verifyCredentialMock = vi.hoisted(() => vi.fn())

vi.mock('@digitalcredentials/verifier-core', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@digitalcredentials/verifier-core')>()
  return {
    ...mod,
    verifyCredential: verifyCredentialMock
  }
})

import { lookupVcRecognition } from './vc-recognition-handler.js'

const listUrl = 'https://example.com/recognition.json'

const buildVc = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  '@context': ['https://www.w3.org/ns/credentials/v2'],
  type: ['VerifiableCredential', 'VerifiableRecognitionCredential'],
  issuer: 'did:web:learning-commission.example',
  validFrom: '2025-01-01T00:00:00Z',
  validUntil: '2030-01-01T00:00:00Z',
  credentialSubject: [
    {
      id: 'did:web:university.example',
      type: 'RecognizedEntity',
      name: 'Example Tech'
    }
  ],
  ...overrides
})

const registry: EntityIdentityRegistry = {
  name: 'Recognition List',
  type: 'vc-recognition',
  url: listUrl,
  acceptedIssuers: ['did:web:learning-commission.example']
}

describe('lookupVcRecognition', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    verifyCredentialMock.mockReset()
    verifyCredentialMock.mockResolvedValue({
      verified: true,
      credential: {},
      results: []
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns found when DID appears in credentialSubject array', async () => {
    const vc = buildVc()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => vc
    } as Response)

    const cache = new Keyv()
    const result = await lookupVcRecognition(
      'did:web:university.example',
      registry,
      cache
    )
    expect(result).toEqual({ status: 'found', registryName: 'Recognition List' })
    expect(verifyCredentialMock).toHaveBeenCalledTimes(1)
  })

  it('returns found when credentialSubject is a single object', async () => {
    const vc = buildVc({
      credentialSubject: {
        id: 'did:key:single',
        type: 'RecognizedEntity'
      }
    })
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => vc
    } as Response)

    const cache = new Keyv()
    const result = await lookupVcRecognition('did:key:single', registry, cache)
    expect(result).toEqual({ status: 'found', registryName: 'Recognition List' })
  })

  it('returns not-found when DID is absent', async () => {
    const vc = buildVc()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => vc
    } as Response)

    const cache = new Keyv()
    const result = await lookupVcRecognition('did:key:missing', registry, cache)
    expect(result).toEqual({ status: 'not-found' })
  })

  it('returns unchecked when issuer is not in acceptedIssuers', async () => {
    const vc = buildVc({ issuer: 'did:web:untrusted.example' })
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => vc
    } as Response)

    const cache = new Keyv()
    const result = await lookupVcRecognition(
      'did:web:university.example',
      registry,
      cache
    )
    expect(result).toEqual({
      status: 'unchecked',
      registryName: 'Recognition List'
    })
    expect(verifyCredentialMock).not.toHaveBeenCalled()
  })

  it('matches issuer object id against acceptedIssuers', async () => {
    const vc = buildVc({
      issuer: { id: 'did:web:learning-commission.example', type: 'RecognizedIssuer' }
    })
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => vc
    } as Response)

    const cache = new Keyv()
    const result = await lookupVcRecognition(
      'did:web:university.example',
      registry,
      cache
    )
    expect(result.status).toBe('found')
  })

  it('returns unchecked when verifyCredential reports not verified', async () => {
    const vc = buildVc()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => vc
    } as Response)
    verifyCredentialMock.mockResolvedValue({
      verified: false,
      credential: {},
      results: []
    })

    const cache = new Keyv()
    const result = await lookupVcRecognition(
      'did:web:university.example',
      registry,
      cache
    )
    expect(result).toEqual({
      status: 'unchecked',
      registryName: 'Recognition List'
    })
  })

  it('calls verifyCredential only once when response is cached', async () => {
    const vc = buildVc()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => vc
    } as Response)

    const cache = new Keyv()
    await lookupVcRecognition('did:web:university.example', registry, cache)
    await lookupVcRecognition('did:web:university.example', registry, cache)

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(verifyCredentialMock).toHaveBeenCalledTimes(1)
  })

  it('uses validUntil for cache TTL', async () => {
    const future = new Date(Date.now() + 7200_000).toISOString()
    const vc = buildVc({ validUntil: future })
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => vc
    } as Response)

    const cache = new Keyv()
    const setSpy = vi.spyOn(cache, 'set')
    await lookupVcRecognition('did:web:university.example', registry, cache)

    const ttlArg = setSpy.mock.calls[0]?.[2] as number
    expect(ttlArg).toBeGreaterThan(7000_000)
    expect(ttlArg).toBeLessThanOrEqual(7200_000)
  })

  it('returns unchecked on fetch failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network'))

    const cache = new Keyv()
    const result = await lookupVcRecognition(
      'did:web:university.example',
      registry,
      cache
    )
    expect(result).toEqual({
      status: 'unchecked',
      registryName: 'Recognition List'
    })
  })

  it('returns unchecked when registry type is not vc-recognition', async () => {
    const dcc: EntityIdentityRegistry = {
      name: 'Legacy',
      type: 'dcc-legacy',
      url: 'https://example.com/r.json'
    }
    const cache = new Keyv()
    const result = await lookupVcRecognition('did:key:x', dcc, cache)
    expect(result).toEqual({ status: 'unchecked', registryName: 'Legacy' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

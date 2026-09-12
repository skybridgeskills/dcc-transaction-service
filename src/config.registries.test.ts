/**
 * Registry name resolution: the two behaviours that let a broken trust source
 * ride along silently for four months, now pinned.
 *
 * 1. An unknown name used to be fabricated into `https://example.com/<slug>.json`.
 * 2. `[]` and `undefined` are not interchangeable — see `resolveTrustedRegistries`.
 */
import type { EntityIdentityRegistry } from '@digitalcredentials/verifier-core'
import { describe, expect, it } from 'vitest'
import {
  mapRegistryNamesToRegistries,
  resolveTrustedRegistries
} from './config.js'

const known: Record<string, EntityIdentityRegistry> = {
  'DCC Sandbox Registry': {
    name: 'DCC Sandbox Registry',
    type: 'dcc-legacy',
    url: 'https://digitalcredentials.github.io/sandbox-registry/registry.json'
  }
}

const configWith = (
  defaultTrustedRegistryNames: string[]
): App.Config =>
  ({
    defaultTrustedRegistryNames,
    knownRegistries: known
  }) as unknown as App.Config

describe('mapRegistryNamesToRegistries', () => {
  it('resolves a configured name', () => {
    expect(mapRegistryNamesToRegistries(['DCC Sandbox Registry'], known)).toEqual(
      [known['DCC Sandbox Registry']]
    )
  })

  it('takes an http(s) name as an ad-hoc dcc-legacy registry', () => {
    expect(mapRegistryNamesToRegistries(['https://x.example/r.json'], known)).toEqual(
      [
        {
          name: 'https://x.example/r.json',
          type: 'dcc-legacy',
          url: 'https://x.example/r.json'
        }
      ]
    )
  })

  it('throws on an unknown name rather than inventing a URL for it', () => {
    // The exact name that spent four months resolving to example.com.
    expect(() =>
      mapRegistryNamesToRegistries(['DCC Issuer Registry'], known)
    ).toThrow(/unknown registry "DCC Issuer Registry"/)
  })

  it('never produces an example.com URL', () => {
    expect(() => mapRegistryNamesToRegistries(['Anything At All'], known)).toThrow()
  })
})

describe('resolveTrustedRegistries', () => {
  it('returns undefined — not [] — when no registries are configured', () => {
    // `[]` is truthy in verifier-core's issuer-registry-check, so it would run a
    // lookup against zero registries and report a bare failure. `undefined` skips.
    expect(resolveTrustedRegistries(undefined, configWith([]))).toBeUndefined()
    expect(resolveTrustedRegistries([], configWith([]))).toBeUndefined()
  })

  it('falls back to the service default when the exchange names none', () => {
    expect(
      resolveTrustedRegistries([], configWith(['DCC Sandbox Registry']))
    ).toEqual([known['DCC Sandbox Registry']])
  })

  it("prefers the exchange's own names over the default", () => {
    expect(
      resolveTrustedRegistries(['https://x.example/r.json'], configWith([]))
    ).toEqual([
      {
        name: 'https://x.example/r.json',
        type: 'dcc-legacy',
        url: 'https://x.example/r.json'
      }
    ])
  })
})

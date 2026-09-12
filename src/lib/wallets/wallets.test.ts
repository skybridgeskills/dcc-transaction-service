/**
 * The wallet product table, and the URL shapes it points at.
 *
 * ⚠️ **The URL assertions below are the SAME assertions this file has always
 * carried, string for string.** They moved from four vendor-named builders to
 * one shape module, and the expected bytes did not change — the split was the
 * point, not a rewrite of what we emit. If one of these strings ever needs
 * editing, the bytes moved and that is a finding.
 */
import { describe, test, expect } from 'vitest'
import {
  wallets,
  getWallet,
  findWalletByName,
  searchWallets,
  preferredConstructionFor,
  protocolProfileForProduct,
  walletLinkFor
} from './index.js'
import { buildWalletLink } from './link-constructions.js'
import { lcw } from './lcw.js'
import { asuPocket } from './asuPocket.js'
import { mySkillsPocket } from './mySkillsPocket.js'
import { learnCard } from './learnCard.js'

const testEndpoint =
  'http://localhost:4005/workflows/verify/exchanges/test-123'

describe('wallet registry', () => {
  test('exports all wallets', () => {
    expect(wallets).toHaveLength(4)
  })

  test('getWallet returns wallet by id', () => {
    expect(getWallet('lcw')).toBe(lcw)
    expect(getWallet('asu-pocket')).toBe(asuPocket)
    expect(getWallet('my-skills-pocket')).toBe(mySkillsPocket)
    expect(getWallet('learncard')).toBe(learnCard)
  })

  test('getWallet returns undefined for unknown id', () => {
    expect(getWallet('unknown')).toBeUndefined()
  })
})

describe('the shapes — unchanged bytes, one home', () => {
  test('the issuer/auth/challenge shape, without a challenge', () => {
    expect(
      walletLinkFor('lcw', 'issuer-auth-challenge-query', {
        serviceEndpoint: testEndpoint
      })
    ).toBe(
      `https://lcw.app/request.html?issuer=localhost&auth_type=bearer&vc_request_url=${encodeURIComponent(testEndpoint)}`
    )
  })

  test('the issuer/auth/challenge shape, with one', () => {
    const challenge = 'test-challenge-uuid'
    expect(
      walletLinkFor('lcw', 'issuer-auth-challenge-query', {
        serviceEndpoint: testEndpoint,
        challenge
      })
    ).toBe(
      `https://lcw.app/request.html?issuer=localhost&auth_type=bearer&challenge=${challenge}&vc_request_url=${encodeURIComponent(testEndpoint)}`
    )
  })

  test('the protocols-JSON shape decodes to a valid exchange invitation', () => {
    const url = walletLinkFor('lcw', 'protocols-json-query', {
      serviceEndpoint: testEndpoint
    })!
    expect(url).toBe(
      `https://lcw.app/request?request=${encodeURIComponent(
        JSON.stringify({ protocols: { vcapi: testEndpoint } })
      )}`
    )
    expect(
      JSON.parse(new URL(url).searchParams.get('request')!)
    ).toEqual({ protocols: { vcapi: testEndpoint } })
  })

  test.each([
    ['asu-pocket', `asuprequest://request`],
    ['my-skills-pocket', `msprequest://request`],
    ['learncard', `https://learncard.app/request`]
  ])('%s builds the vc_request_url shape at its own base', (id, base) => {
    expect(
      walletLinkFor(id, 'vc-request-url-query', {
        serviceEndpoint: testEndpoint
      })
    ).toBe(`${base}?vc_request_url=${encodeURIComponent(testEndpoint)}`)
  })

  test('⚠️ three products share ONE shape — the overlap the old layout hid', () => {
    // Three builders in three vendor-named files were one construction all
    // along. Seeing that is the whole reason shape and product are separate.
    const sharing = wallets.filter((w) =>
      w.links.some((l) => l.construction === 'vc-request-url-query')
    )
    expect(sharing.map((w) => w.id).sort()).toEqual([
      'asu-pocket',
      'learncard',
      'my-skills-pocket'
    ])
  })

  test('⚠️ one product, two shapes, two DIFFERENT paths', () => {
    // `/request` and `/request.html` are not the same endpoint. A single base
    // per product would have built one of them wrong, silently.
    expect(lcw.links.map((l) => l.base)).toEqual([
      'https://lcw.app/request',
      'https://lcw.app/request.html'
    ])
  })

  test('`none` builds nothing, and says so with undefined', () => {
    // Not an empty string: a key carrying `''` is a link a wallet will follow.
    expect(
      buildWalletLink('none', 'https://x.example', {
        serviceEndpoint: testEndpoint
      })
    ).toBeUndefined()
  })
})

describe('lookups never fail, they fall back', () => {
  test('⚠️ a product absent from the table has no profile, and that is not an error', () => {
    expect(protocolProfileForProduct('a-wallet-nobody-added')).toBeUndefined()
    expect(() =>
      protocolProfileForProduct('a-wallet-nobody-added')
    ).not.toThrow()
  })

  test('a product present but carrying no profile also resolves to undefined', () => {
    // The normal case. Naming a profile per product would let a stale table
    // start changing bytes.
    expect(protocolProfileForProduct('lcw')).toBeUndefined()
  })

  test('an unknown product builds no link rather than a broken one', () => {
    expect(
      walletLinkFor('a-wallet-nobody-added', 'vc-request-url-query', {
        serviceEndpoint: testEndpoint
      })
    ).toBeUndefined()
  })

  test('a product asked for a shape it does not speak builds nothing', () => {
    expect(
      walletLinkFor('learncard', 'protocols-json-query', {
        serviceEndpoint: testEndpoint
      })
    ).toBeUndefined()
  })

  test('the preferred shape is the first one listed', () => {
    expect(preferredConstructionFor('lcw')).toBe('protocols-json-query')
    expect(preferredConstructionFor('learncard')).toBe('vc-request-url-query')
  })
})

describe('search by app name', () => {
  test.each([
    ['Learner Credential Wallet', 'lcw'],
    ['LCW', 'lcw'],
    ['lcw', 'lcw'],
    ['ASU Pocket', 'asu-pocket'],
    ['asupocket', 'asu-pocket'],
    ['My Skills Pocket', 'my-skills-pocket'],
    ['MSP', 'my-skills-pocket'],
    ['Learn Card', 'learncard'],
    ['LearnCard', 'learncard']
  ])('“%s” finds %s', (query, id) => {
    // An operator reading a name off a launcher types what they see, not a
    // slug — including a name the vendor has since dropped.
    expect(findWalletByName(query)?.id).toBe(id)
  })

  test('an unknown name finds nothing, and does not throw', () => {
    expect(findWalletByName('Some Wallet We Have Never Heard Of')).toBeUndefined()
  })
})

/**
 * ⚠️ **Ranked candidates, and a separate function from the exact lookup.** Every
 * case below runs against the SHIPPED table, so the queries are ones a person
 * would actually type during a run rather than ones a fixture was built to
 * satisfy.
 */
describe('searchWallets — ranked candidates while you type', () => {
  const ids = (query: string) => searchWallets(query).map((w) => w.id)

  test('⚠️ a partial name finds the product — the case findWalletByName misses', () => {
    // The control. `findWalletByName('Learne')` is `undefined`, and on screen
    // that is indistinguishable from a product genuinely absent from the table.
    expect(findWalletByName('Learne')).toBeUndefined()
    expect(ids('Learne')).toContain('lcw')
  })

  test('a substring of the display name finds it', () => {
    expect(ids('credential wallet')).toContain('lcw')
  })

  test('⚠️ a word only the description carries still finds the product', () => {
    // Both ASU products say "Arizona State University" in text this repo
    // shipped. Refusing to search it would be a worse answer than ranking it
    // low, which is what score 1 does.
    expect(ids('Arizona')).toEqual(
      expect.arrayContaining(['asu-pocket', 'my-skills-pocket'])
    )
  })

  test('an alias finds the product', () => {
    expect(ids('MSP')).toEqual(['my-skills-pocket'])
  })

  test('⚠️ an exact match ranks above a substring match', () => {
    // `Pocket` is an ALIAS of ASU Pocket and a SUBSTRING of My Skills Pocket.
    // The rank is the whole reason the two are separate scores.
    expect(ids('Pocket')).toEqual(['asu-pocket', 'my-skills-pocket'])
  })

  test('⚠️ a product not in the table returns nothing, and that is not an error', () => {
    expect(ids('Sphereon Wallet')).toEqual([])
  })

  test('an empty query matches nothing', () => {
    expect(ids('')).toEqual([])
    expect(ids('   ')).toEqual([])
  })

  test('⚠️ findWalletByName still answers with exactly one product or none', () => {
    // The two functions have not been merged by accident. Every query above
    // that is not an exact name must still resolve to nothing here.
    for (const query of ['Learne', 'credential wallet', 'Arizona']) {
      expect(findWalletByName(query)).toBeUndefined()
    }
    expect(findWalletByName('MSP')?.id).toBe('my-skills-pocket')
    expect(findWalletByName('LCW')?.id).toBe('lcw')
    // ⚠️ `Pocket` is a real ALIAS, so the exact lookup resolves it to exactly
    // one product while the search returns two. That is the two functions
    // disagreeing correctly, not by accident.
    expect(findWalletByName('Pocket')?.id).toBe('asu-pocket')
  })
})

describe('the product → profile mapping', () => {
  // Fixtures rather than the shipped table: these assert what the mapping CAN
  // express, and no shipped product names a profile today.
  const twoProductsOneProfile = [
    {
      id: 'first-product',
      name: 'First Product',
      links: [
        { construction: 'vc-request-url-query' as const, base: 'a://request' }
      ],
      protocolProfileName: 'oid4vp-1.0-by-value-dcql-redirect-uri'
    },
    {
      id: 'second-product',
      name: 'Second Product',
      links: [
        { construction: 'vc-request-url-query' as const, base: 'b://request' }
      ],
      protocolProfileName: 'oid4vp-1.0-by-value-dcql-redirect-uri'
    }
  ]

  test('⚠️ two products may point at ONE profile — that overlap is the goal', () => {
    // Vendor-named profiles would have made this unsayable: two products
    // sharing a construction is the thing the service exists to find, and a
    // profile per vendor hides it behind two names for one set of bytes.
    expect(
      protocolProfileForProduct('first-product', twoProductsOneProfile)
    ).toBe('oid4vp-1.0-by-value-dcql-redirect-uri')
    expect(
      protocolProfileForProduct('second-product', twoProductsOneProfile)
    ).toBe('oid4vp-1.0-by-value-dcql-redirect-uri')
  })

  test('a profile a product names is one the service actually serves', async () => {
    // A table entry pointing at a profile that does not exist would resolve to
    // a throw at mint. The table may go stale about a vendor; it may not go
    // stale about our own registry.
    const { PROTOCOL_PROFILES } = await import(
      '../../protocol-profiles/registry.js'
    )
    for (const product of [...wallets, ...twoProductsOneProfile]) {
      if (!product.protocolProfileName) continue
      expect(Object.keys(PROTOCOL_PROFILES)).toContain(
        product.protocolProfileName
      )
    }
  })
})

describe('⚠️ no URL building remains in a vendor-named module', () => {
  test('every product entry is pure data', () => {
    // The coupling this milestone broke: an object that was both "who this
    // vendor is" and "what bytes we build for them".
    for (const wallet of wallets) {
      for (const value of Object.values(wallet)) {
        expect(typeof value).not.toBe('function')
      }
      for (const link of wallet.links) {
        expect(typeof link.base).toBe('string')
        expect(typeof link.construction).toBe('string')
      }
    }
  })
})

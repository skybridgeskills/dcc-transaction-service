import { describe, test, expect } from 'vitest'
import { wallets, getWallet, getWalletInteractionUrl } from './index.js'
import { lcw } from './lcw.js'
import { asuPocket } from './asuPocket.js'
import { mySkillsPocket } from './mySkillsPocket.js'

const testEndpoint =
  'http://localhost:4005/workflows/verify/exchanges/test-123'

describe('wallet registry', () => {
  test('exports all wallets', () => {
    expect(wallets).toHaveLength(3)
  })

  test('getWallet returns wallet by id', () => {
    expect(getWallet('lcw')).toBe(lcw)
    expect(getWallet('asu-pocket')).toBe(asuPocket)
    expect(getWallet('my-skills-pocket')).toBe(mySkillsPocket)
  })

  test('getWallet returns undefined for unknown id', () => {
    expect(getWallet('unknown')).toBeUndefined()
  })
})

describe('wallet vcapi interaction URLs', () => {
  test('LCW generates lcw.app deep link', () => {
    const url = lcw.protocols.vcapi!.getInteractionUrl(testEndpoint)
    expect(url).toContain('https://lcw.app/request')
    expect(url).toContain(encodeURIComponent(testEndpoint))
    const parsed = new URL(url)
    const request = JSON.parse(
      decodeURIComponent(parsed.searchParams.get('request')!)
    )
    expect(request.credentialRequestOrigin).toBe('http://localhost:4005')
    expect(request.protocols.vcapi).toBe(testEndpoint)
  })

  test('ASU Pocket generates asuprequest:// URL', () => {
    const url = asuPocket.protocols.vcapi!.getInteractionUrl(testEndpoint)
    expect(url).toMatch(/^asuprequest:\/\//)
    expect(url).toContain(encodeURIComponent(testEndpoint))
  })

  test('My Skills Pocket generates msprequest:// URL', () => {
    const url = mySkillsPocket.protocols.vcapi!.getInteractionUrl(testEndpoint)
    expect(url).toMatch(/^msprequest:\/\//)
    expect(url).toContain(encodeURIComponent(testEndpoint))
  })

  test('getWalletInteractionUrl helper works', () => {
    const url = getWalletInteractionUrl('lcw', 'vcapi', testEndpoint)
    expect(url).toContain('https://lcw.app/request')
  })

  test('getWalletInteractionUrl returns undefined for unknown wallet', () => {
    const url = getWalletInteractionUrl('unknown', 'vcapi', testEndpoint)
    expect(url).toBeUndefined()
  })
})

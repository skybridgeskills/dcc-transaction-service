import { describe, test, expect } from 'vitest'
import { wallets, getWallet, getWalletInteractionUrl } from './index.js'
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

describe('wallet vcapi interaction URLs', () => {
  test('LCW generates lcw.app legacy deep link with issuer and vc_request_url', () => {
    const url = lcw.protocols.vcapi!.getInteractionUrl(testEndpoint)
    expect(url).toBe(
      `https://lcw.app/request.html?issuer=localhost&auth_type=bearer&vc_request_url=${encodeURIComponent(testEndpoint)}`
    )
  })

  test('LCW includes challenge in URL when provided', () => {
    const challenge = 'test-challenge-uuid'
    const url = lcw.protocols.vcapi!.getInteractionUrl(testEndpoint, {
      challenge
    })
    expect(url).toBe(
      `https://lcw.app/request.html?issuer=localhost&auth_type=bearer&challenge=${challenge}&vc_request_url=${encodeURIComponent(testEndpoint)}`
    )
  })

  test('ASU Pocket generates asuprequest:// URL with vc_request_url', () => {
    const url = asuPocket.protocols.vcapi!.getInteractionUrl(testEndpoint)
    expect(url).toBe(
      `asuprequest://request?vc_request_url=${encodeURIComponent(testEndpoint)}`
    )
  })

  test('My Skills Pocket generates msprequest:// URL with vc_request_url', () => {
    const url = mySkillsPocket.protocols.vcapi!.getInteractionUrl(testEndpoint)
    expect(url).toBe(
      `msprequest://request?vc_request_url=${encodeURIComponent(testEndpoint)}`
    )
  })

  test('LearnCard generates learncard.app URL with vc_request_url', () => {
    const url = learnCard.protocols.vcapi!.getInteractionUrl(testEndpoint)
    expect(url).toBe(
      `https://learncard.app/request?vc_request_url=${encodeURIComponent(testEndpoint)}`
    )
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

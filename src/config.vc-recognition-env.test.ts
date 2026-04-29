import { describe, expect, it, vi } from 'vitest'
import { parseVcRecognitionRegistriesFromEnv } from './config.js'

describe('parseVcRecognitionRegistriesFromEnv', () => {
  it('parses URL and comma-separated accepted issuers', () => {
    const env = {
      REGISTRY_VC_RECOGNITION_SKY_URL: ' https://x.example/vc ',
      REGISTRY_VC_RECOGNITION_SKY_ACCEPTED_ISSUERS: ' did:a , did:b '
    }
    expect(parseVcRecognitionRegistriesFromEnv(env)).toEqual({
      VC_RECOGNITION_SKY: {
        name: 'VC_RECOGNITION_SKY',
        type: 'vc-recognition',
        url: 'https://x.example/vc',
        acceptedIssuers: ['did:a', 'did:b']
      }
    })
  })

  it('skips when URL is whitespace only', () => {
    const env = {
      REGISTRY_VC_RECOGNITION_SKY_URL: '  ',
      REGISTRY_VC_RECOGNITION_SKY_ACCEPTED_ISSUERS: 'did:a'
    }
    expect(parseVcRecognitionRegistriesFromEnv(env)).toEqual({})
  })

  it('skips when ACCEPTED_ISSUERS is missing', () => {
    const env = { REGISTRY_VC_RECOGNITION_SKY_URL: 'https://x' }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parseVcRecognitionRegistriesFromEnv(env)).toEqual({})
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

import { describe, expect, it } from 'vitest'
import { parseOidfRegistriesFromEnv } from './config.js'

describe('parseOidfRegistriesFromEnv', () => {
  it('parses trust anchor entity-configuration URL', () => {
    const env = {
      REGISTRY_OIDF_SKY_TRUST_ANCHOR_EC: ' https://ta.example/ec.jwt '
    }
    expect(parseOidfRegistriesFromEnv(env)).toEqual({
      OIDF_SKY: {
        name: 'OIDF_SKY',
        type: 'oidf',
        trustAnchorEC: 'https://ta.example/ec.jwt'
      }
    })
  })

  it('skips when value is whitespace only', () => {
    const env = { REGISTRY_OIDF_SKY_TRUST_ANCHOR_EC: '   ' }
    expect(parseOidfRegistriesFromEnv(env)).toEqual({})
  })
})

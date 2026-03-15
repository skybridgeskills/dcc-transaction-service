import { describe, test, expect } from 'vitest'
import { parseArgs, loadProfile } from './cli'

describe('parseArgs', () => {
  test('parses workflowId and profileName', () => {
    const result = parseArgs(['node', 'cli.ts', 'claim', 'ob3'])
    expect(result).toEqual({
      workflowId: 'claim',
      profileName: 'ob3',
      open: true
    })
  })

  test('defaults profileName to "default"', () => {
    const result = parseArgs(['node', 'cli.ts', 'didAuth'])
    expect(result).toEqual({
      workflowId: 'didAuth',
      profileName: 'default',
      open: true
    })
  })

  test('respects --no-open flag', () => {
    const result = parseArgs(['node', 'cli.ts', 'verify', 'ob3', '--no-open'])
    expect(result).toEqual({
      workflowId: 'verify',
      profileName: 'ob3',
      open: false
    })
  })

  test('returns null for --help', () => {
    expect(parseArgs(['node', 'cli.ts', '--help'])).toBeNull()
  })

  test('returns null for empty args', () => {
    expect(parseArgs(['node', 'cli.ts'])).toBeNull()
  })

  test('returns null for invalid workflow', () => {
    expect(parseArgs(['node', 'cli.ts', 'bogus'])).toBeNull()
  })
})

describe('loadProfile', () => {
  test('loads claim/ob3 profile', async () => {
    const vars = await loadProfile('claim', 'ob3')
    expect(vars.tenantName).toBe('default')
    expect(typeof vars.vc).toBe('string')
    expect(JSON.parse(vars.vc as string).type).toContain('OpenBadgeCredential')
  })

  test('loads verify/ob3 profile', async () => {
    const vars = await loadProfile('verify', 'ob3')
    expect(vars.tenantName).toBe('default')
    expect(vars.vprCredentialType).toContain('OpenBadgeCredential')
  })

  test('loads didAuth/default profile', async () => {
    const vars = await loadProfile('didAuth', 'default')
    expect(vars.tenantName).toBe('default')
  })

  test('throws for unknown profile', async () => {
    await expect(loadProfile('claim', 'nonexistent')).rejects.toThrow(
      'Profile "nonexistent" not found'
    )
  })
})

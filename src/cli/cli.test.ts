import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseArgs, loadProfile, mergeVerifierOptions } from './cli'

describe('parseArgs', () => {
  test('parses workflowId and profileName', () => {
    const result = parseArgs(['node', 'cli.ts', 'claim', 'ob3'])
    expect(result).toEqual({
      workflowId: 'claim',
      profileName: 'ob3',
      open: true,
      options: {}
    })
  })

  test('defaults profileName to "default"', () => {
    const result = parseArgs(['node', 'cli.ts', 'didAuth'])
    expect(result).toEqual({
      workflowId: 'didAuth',
      profileName: 'default',
      open: true,
      options: {}
    })
  })

  test('respects --no-open flag', () => {
    const result = parseArgs(['node', 'cli.ts', 'verify', 'ob3', '--no-open'])
    expect(result).toEqual({
      workflowId: 'verify',
      profileName: 'ob3',
      open: false,
      options: {}
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

describe('parseArgs — verifier-core option flags', () => {
  test('-v / --verbose sets options.verbose', () => {
    expect(parseArgs(['node', 'cli.ts', 'verify', 'ob3', '-v'])?.options).toEqual(
      { verbose: true }
    )
    expect(
      parseArgs(['node', 'cli.ts', 'verify', 'ob3', '--verbose'])?.options
    ).toEqual({ verbose: true })
  })

  test('-t / --timing sets options.timing', () => {
    expect(parseArgs(['node', 'cli.ts', 'verify', 'ob3', '-t'])?.options).toEqual(
      { timing: true }
    )
    expect(
      parseArgs(['node', 'cli.ts', 'verify', 'ob3', '--timing'])?.options
    ).toEqual({ timing: true })
  })

  test('-v -t and --verbose --timing both set both options', () => {
    expect(
      parseArgs(['node', 'cli.ts', 'verify', 'ob3', '-v', '-t'])?.options
    ).toEqual({ verbose: true, timing: true })
    expect(
      parseArgs([
        'node',
        'cli.ts',
        'verify',
        'ob3',
        '--verbose',
        '--timing'
      ])?.options
    ).toEqual({ verbose: true, timing: true })
  })

  test('cluster-form -vt sets both options', () => {
    expect(parseArgs(['node', 'cli.ts', 'verify', 'ob3', '-vt'])?.options).toEqual(
      { verbose: true, timing: true }
    )
  })

  test('absent flags omit the corresponding key (no false in payload)', () => {
    const result = parseArgs(['node', 'cli.ts', 'verify', 'ob3'])
    expect(result?.options).toEqual({})
    expect('verbose' in (result?.options ?? {})).toBe(false)
    expect('timing' in (result?.options ?? {})).toBe(false)
  })

  test('flags accepted on every workflow', () => {
    expect(
      parseArgs(['node', 'cli.ts', 'didAuth', '-v'])?.options
    ).toEqual({ verbose: true })
    expect(
      parseArgs(['node', 'cli.ts', 'claim', 'ob3', '-t'])?.options
    ).toEqual({ timing: true })
  })
})

describe('mergeVerifierOptions', () => {
  test('returns undefined when no profile or CLI options', () => {
    expect(mergeVerifierOptions({}, {})).toBeUndefined()
  })

  test('preserves profile-set options when CLI omits them', () => {
    expect(
      mergeVerifierOptions({ options: { verbose: true } }, {})
    ).toEqual({ verbose: true })
  })

  test('CLI-set options layer on top of profile options', () => {
    expect(
      mergeVerifierOptions({ options: { verbose: true } }, { timing: true })
    ).toEqual({ verbose: true, timing: true })
  })

  test('CLI -v with profile options.verbose=true preserves true (no clobber)', () => {
    expect(
      mergeVerifierOptions({ options: { verbose: true } }, { verbose: true })
    ).toEqual({ verbose: true })
  })
})

describe('--help mentions the new flags', () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  test('lists -v/--verbose and -t/--timing under Options', () => {
    parseArgs(['node', 'cli.ts', '--help'])
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(printed).toMatch(/-v, --verbose/)
    expect(printed).toMatch(/-t, --timing/)
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

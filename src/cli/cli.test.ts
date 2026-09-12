import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseArgs, loadProfile, mergeVerifierOptions } from './cli.js'

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
    expect(
      parseArgs(['node', 'cli.ts', 'verify', 'ob3', '-v'])?.options
    ).toEqual({ verbose: true })
    expect(
      parseArgs(['node', 'cli.ts', 'verify', 'ob3', '--verbose'])?.options
    ).toEqual({ verbose: true })
  })

  test('-t / --timing sets options.timing', () => {
    expect(
      parseArgs(['node', 'cli.ts', 'verify', 'ob3', '-t'])?.options
    ).toEqual({ timing: true })
    expect(
      parseArgs(['node', 'cli.ts', 'verify', 'ob3', '--timing'])?.options
    ).toEqual({ timing: true })
  })

  test('-v -t and --verbose --timing both set both options', () => {
    expect(
      parseArgs(['node', 'cli.ts', 'verify', 'ob3', '-v', '-t'])?.options
    ).toEqual({ verbose: true, timing: true })
    expect(
      parseArgs(['node', 'cli.ts', 'verify', 'ob3', '--verbose', '--timing'])
        ?.options
    ).toEqual({ verbose: true, timing: true })
  })

  test('cluster-form -vt sets both options', () => {
    expect(
      parseArgs(['node', 'cli.ts', 'verify', 'ob3', '-vt'])?.options
    ).toEqual({ verbose: true, timing: true })
  })

  test('absent flags omit the corresponding key (no false in payload)', () => {
    const result = parseArgs(['node', 'cli.ts', 'verify', 'ob3'])
    expect(result?.options).toEqual({})
    expect('verbose' in (result?.options ?? {})).toBe(false)
    expect('timing' in (result?.options ?? {})).toBe(false)
  })

  test('flags accepted on every workflow', () => {
    expect(parseArgs(['node', 'cli.ts', 'didAuth', '-v'])?.options).toEqual({
      verbose: true
    })
    expect(
      parseArgs(['node', 'cli.ts', 'claim', 'ob3', '-t'])?.options
    ).toEqual({ timing: true })
  })
})

describe('parseArgs — --protocol-profile', () => {
  test('sets protocolProfileName from the flag', () => {
    expect(
      parseArgs([
        'node',
        'cli.ts',
        'verify',
        'ob3',
        '--protocol-profile',
        'vcapi-vpr-bare-origin-domain'
      ])?.protocolProfileName
    ).toBe('vcapi-vpr-bare-origin-domain')
  })

  test('accepts the --flag=value form', () => {
    expect(
      parseArgs([
        'node',
        'cli.ts',
        'verify',
        'ob3',
        '--protocol-profile=oid4vp-1.0-by-value-dcql-redirect-uri'
      ])?.protocolProfileName
    ).toBe('oid4vp-1.0-by-value-dcql-redirect-uri')
  })

  /**
   * ⚠️ The key must be ABSENT, not `undefined`-valued: `main` spreads it over
   * the profile file's variables, so a present key would erase a profile-set
   * `protocolProfileName` whenever the flag was not passed.
   */
  test('omits the key entirely when the flag is absent', () => {
    const result = parseArgs(['node', 'cli.ts', 'verify', 'ob3'])
    expect('protocolProfileName' in (result ?? {})).toBe(false)
  })

  test('accepted on every workflow, and alongside the option flags', () => {
    expect(
      parseArgs([
        'node',
        'cli.ts',
        'claim',
        'ob3',
        '-vt',
        '--protocol-profile',
        'vcapi-vpr-no-accepted-cryptosuites'
      ])
    ).toEqual({
      workflowId: 'claim',
      profileName: 'ob3',
      open: true,
      protocolProfileName: 'vcapi-vpr-no-accepted-cryptosuites',
      options: { verbose: true, timing: true }
    })
  })

  test('an unregistered name still parses — the server rejects it, not the CLI', () => {
    expect(
      parseArgs([
        'node',
        'cli.ts',
        'verify',
        'ob3',
        '--protocol-profile',
        'not-a-registered-profile'
      ])?.protocolProfileName
    ).toBe('not-a-registered-profile')
  })
})

describe('mergeVerifierOptions', () => {
  test('returns undefined when no profile or CLI options', () => {
    expect(mergeVerifierOptions({}, {})).toBeUndefined()
  })

  test('preserves profile-set options when CLI omits them', () => {
    expect(mergeVerifierOptions({ options: { verbose: true } }, {})).toEqual({
      verbose: true
    })
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

  test('documents --protocol-profile and shows it in an example', () => {
    parseArgs(['node', 'cli.ts', '--help'])
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(printed).toMatch(/--protocol-profile <name>/)
    expect(printed).toMatch(
      /pnpm transaction verify ob3 --protocol-profile vcapi-vpr-bare-origin-domain/
    )
  })
})

describe('loadProfile', () => {
  test('loads claim/ob3 profile', async () => {
    const vars = await loadProfile('claim', 'ob3')
    expect(vars.tenantName).toBeUndefined()
    expect(typeof vars.vc).toBe('string')
    expect(JSON.parse(vars.vc as string).type).toContain('OpenBadgeCredential')
  })

  test('loads verify/ob3 profile', async () => {
    const vars = await loadProfile('verify', 'ob3')
    expect(vars.tenantName).toBeUndefined()
    expect(vars.vprCredentialType).toContain('OpenBadgeCredential')
  })

  test('loads didAuth/default profile', async () => {
    const vars = await loadProfile('didAuth', 'default')
    expect(vars.tenantName).toBeUndefined()
  })

  test('throws for unknown profile', async () => {
    await expect(loadProfile('claim', 'nonexistent')).rejects.toThrow(
      'Profile "nonexistent" not found'
    )
  })
})

describe('the negative claim fixtures', () => {
  /**
   * ⚠️ These five are the only consumers of the post-signing `tamper` seam in
   * `src/workflows/claimWorkflow.ts`. Losing one silently orphans a branch of
   * shipped production code, so the mode each one drives is asserted here.
   */
  test.each([
    ['tamper-claim', 'claim'],
    ['tamper-proof', 'proof'],
    ['issuer-spoof', 'issuer'],
    ['issuer-unresolvable', 'issuer']
  ])('claim/%s drives tamper: %s', async (name, mode) => {
    const vars = await loadProfile('claim', name)
    expect(vars.tamper).toBe(mode)
  })

  test('claim/expired is NOT a tamper fixture — valid proof, bad window', async () => {
    const vars = await loadProfile('claim', 'expired')
    expect(vars.tamper).toBeUndefined()
    const vc = JSON.parse(vars.vc as string)
    expect(vc.validUntil).toBeDefined()
    expect(Date.parse(vc.validUntil)).toBeLessThan(Date.now())
  })

  /**
   * The two issuer arms only test different things while the spoofed DID
   * resolves and the unresolvable one cannot. If they ever name the same
   * identity the pair collapses into one test.
   */
  test('the two issuer arms name different identities', async () => {
    const spoof = JSON.parse(
      (await loadProfile('claim', 'issuer-spoof')).vc as string
    )
    const unresolvable = JSON.parse(
      (await loadProfile('claim', 'issuer-unresolvable')).vc as string
    )
    expect(spoof.issuer.id).not.toBe(unresolvable.issuer.id)
    expect(unresolvable.issuer.id).toMatch(/\.invalid$/)
  })
})

describe('claim/ob3-vcdm2 is distinct from claim/ob3', () => {
  test('VCDM 2.0 with a did:web issuer, against VCDM 1.1 with did:key', async () => {
    const vcdm2 = JSON.parse(
      (await loadProfile('claim', 'ob3-vcdm2')).vc as string
    )
    const vcdm1 = JSON.parse((await loadProfile('claim', 'ob3')).vc as string)

    expect(vcdm2['@context']).toContain('https://www.w3.org/ns/credentials/v2')
    expect(vcdm2.validFrom).toBeDefined()
    expect(vcdm2.issuer.id).toMatch(/^did:web:/)

    expect(vcdm1['@context']).toContain(
      'https://www.w3.org/2018/credentials/v1'
    )
    expect(vcdm1.issuanceDate).toBeDefined()
    expect(vcdm1.issuer.id).toMatch(/^did:key:/)
  })

  /**
   * The status entry is attached by the status service during claim, via the
   * pre-signing allocate hook — hand-crafting one here would shadow it.
   */
  test('carries no hand-crafted credentialStatus', async () => {
    const vcdm2 = JSON.parse(
      (await loadProfile('claim', 'ob3-vcdm2')).vc as string
    )
    expect(vcdm2.credentialStatus).toBeUndefined()
    // ⚠️ VCDM 2.0 defines the entry terms itself; the older status context
    // redefines them and the signing service refuses the credential.
    expect(vcdm2['@context']).not.toContain(
      'https://www.w3.org/ns/credentials/status/v1'
    )
  })
})

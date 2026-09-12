/**
 * Boot provenance tests.
 *
 * Driven against real throwaway checkouts rather than a mocked `git`, because
 * every one of these assertions is about what git actually reports for a given
 * working-tree state — a mock would only re-assert the fixture author's belief
 * about that, which is the belief being checked.
 *
 * The two that matter most:
 *
 * - **dirt outside `src/` must not read as dirty.** A whole-tree
 *   `git status --porcelain` counts untracked files anywhere, and that is
 *   exactly how the report's own `-dirty` flag came to fire on three fixture
 *   files for an unrelated effort and stop meaning anything. A provenance flag
 *   that cries wolf is a provenance flag the gate learns to ignore.
 * - **"git cannot say" is not "clean".** The fields are absent, never `false`.
 *   A gate that cannot read provenance must fail loudly; if absence rendered as
 *   `srcDirty: false` it would pass silently instead.
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveBootProvenance } from './boot-provenance.js'

let root: string

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

const write = (relative: string, contents: string) => {
  const path = join(root, relative)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, contents)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'boot-provenance-'))
  git('init', '--quiet')
  git('config', 'user.email', 'test@example.invalid')
  git('config', 'user.name', 'Provenance Test')
  write('package.json', JSON.stringify({ name: 'fixture-service', version: '9.9.9' }))
  write('src/server.ts', 'export const port = 4004\n')
  write('docs/notes.md', 'notes\n')
  git('add', '-A')
  git('commit', '--quiet', '-m', 'initial')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('resolveBootProvenance', () => {
  test('reports the full HEAD sha, its abbreviation, and a clean src tree', () => {
    const provenance = resolveBootProvenance(root)

    expect(provenance.gitSha).toBe(git('rev-parse', 'HEAD'))
    expect(provenance.gitSha).toHaveLength(40)
    expect(provenance.gitShaShort).toBe(git('rev-parse', '--short', 'HEAD'))
    expect(provenance.srcDirty).toBe(false)
    expect(provenance.display).toContain('fixture-service 9.9.9')
  })

  test('the sha is the FULL one — an abbreviation would be compared against a repo-wide setting', () => {
    // The other side of this comparison is `git rev-parse HEAD` in a shell
    // script. Abbreviation length is `core.abbrev`, a property of a checkout
    // rather than of a commit, so two abbreviations of the same commit can
    // differ in length and compare unequal.
    const provenance = resolveBootProvenance(root)
    expect(provenance.gitSha).not.toBe(provenance.gitShaShort)
    expect(provenance.gitSha?.startsWith(provenance.gitShaShort ?? 'x')).toBe(true)
  })

  test('a modified tracked file under src/ makes the commit a lower bound', () => {
    write('src/server.ts', 'export const port = 9999\n')

    expect(resolveBootProvenance(root).srcDirty).toBe(true)
  })

  test('an UNTRACKED file under src/ counts — it is loaded just as readily', () => {
    write('src/cli/profiles/claim/new-profile.ts', 'export const x = 1\n')

    expect(resolveBootProvenance(root).srcDirty).toBe(true)
  })

  test('dirt OUTSIDE src/ does not read as dirty — the flag must not cry wolf', () => {
    write('docs/notes.md', 'edited\n')
    write('scratch-fixture.json', '{}\n')

    const provenance = resolveBootProvenance(root)

    expect(provenance.srcDirty).toBe(false)
    // The whole-tree read, which is what the report's `-dirty` uses, does see
    // it — this is the difference being relied on, asserted rather than
    // assumed.
    expect(git('status', '--porcelain')).not.toBe('')
  })

  test('outside a checkout, git cannot say — and absent is not `false`', () => {
    const notARepo = mkdtempSync(join(tmpdir(), 'boot-provenance-bare-'))
    try {
      const provenance = resolveBootProvenance(notARepo)

      expect(provenance.gitSha).toBeUndefined()
      expect(provenance.srcDirty).toBeUndefined()
      expect('srcDirty' in provenance).toBe(false)
      // Still identifies itself and the process, so an unreadable-provenance
      // failure can still name what to go and kill.
      expect(provenance.pid).toBe(process.pid)
      expect(provenance.display).toContain('git unavailable')
    } finally {
      rmSync(notARepo, { recursive: true, force: true })
    }
  })

  test('carries the process identity a stale-process failure needs to be actionable', () => {
    const bootedAt = new Date('2026-08-24T13:57:00.000Z')

    const provenance = resolveBootProvenance(root, bootedAt, 51307)

    expect(provenance.bootedAt).toBe('2026-08-24T13:57:00.000Z')
    expect(provenance.pid).toBe(51307)
  })
})

/**
 * The running service's version, as a citation that stays unambiguous later.
 *
 * ## What "unambiguous a month later" means in practice
 *
 * The package version alone is not enough: this repo's version moves rarely and
 * a deployment runs against a working tree. So the string is
 * `<name> <version> (git <sha>[-dirty])`, and `-dirty` is load-bearing — a
 * process started from an uncommitted tree must say so, or the sha it cites
 * describes code that was not running.
 *
 * Everything git-related is best-effort and synchronous. `git` may be absent,
 * the checkout may not be a repo, and neither is a reason to fail the caller —
 * `lib/boot-provenance.ts` resolves this at import, and a boot that died
 * because git was missing would be a worse outcome than a boot that cannot say
 * which commit it is.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ServiceVersion {
  name: string
  version: string
  gitSha?: string
  gitDirty?: boolean
  /** The one-line citation: `<name> <version> (git <sha>[-dirty])`. */
  display: string
}

/** This module's directory, under `src/` via tsx or `dist/` after a build. */
const moduleDirectory = (): string =>
  typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(fileURLToPath(import.meta.url))

/** Repo root: two levels up from `<root>/{src,dist}/lib/`. */
export const repoRoot = (): string => resolve(moduleDirectory(), '..', '..')

const readPackageJson = (root: string): { name?: string; version?: string } => {
  try {
    return JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      name?: string
      version?: string
    }
  } catch {
    return {}
  }
}

/**
 * Run `git` in `root` and return its trimmed stdout, or `undefined` when it
 * cannot be run at all — git absent, not a checkout, or a non-zero exit.
 *
 * Exported because `lib/boot-provenance.ts` asks git the same kind of question
 * about the same checkout, and two private copies of this would be two places
 * that could disagree about what "cannot say" looks like. **`undefined` means
 * git could not answer; an empty string means git answered with nothing** —
 * `git status --porcelain` on a clean tree is the case that makes the
 * distinction load-bearing, and collapsing the two would report a clean tree as
 * an unavailable one.
 */
export const gitIn = (root: string, args: string[]): string | undefined => {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  } catch {
    return undefined
  }
}

const git = gitIn

/**
 * Resolve the service version.
 *
 * `root` is injectable so tests do not depend on the state of this checkout's
 * git index — a test that goes red because someone has a file staged is a test
 * that gets deleted.
 */
export const resolveServiceVersion = (root = repoRoot()): ServiceVersion => {
  const pkg = readPackageJson(root)
  const name = pkg.name ?? 'dcc-transaction-service'
  const version = pkg.version ?? '0.0.0-unknown'

  const sha = git(root, ['rev-parse', '--short', 'HEAD'])
  const status = sha === undefined ? undefined : git(root, ['status', '--porcelain'])
  const dirty = status === undefined ? undefined : status.length > 0

  const gitPart =
    sha === undefined ? 'git unavailable' : `git ${sha}${dirty ? '-dirty' : ''}`

  return {
    name,
    version,
    ...(sha !== undefined ? { gitSha: sha } : {}),
    ...(dirty !== undefined ? { gitDirty: dirty } : {}),
    display: `${name} ${version} (${gitPart})`
  }
}

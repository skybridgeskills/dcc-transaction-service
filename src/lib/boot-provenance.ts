/**
 * Boot provenance — *which code is this process actually running?*
 *
 * ## The failure this exists to stop
 *
 * The transaction service can end up running as an orphan (PPID 1), holding
 * port 4004 so its supervisor's replacements cannot bind. The repo and the
 * test suite are then green on a commit that widened the verifier's
 * `acceptedMethods` while the live VPR still serves the narrow pre-fix list.
 * **Every check passes against a stale process.** A counterparty's refusal is
 * then recorded as the counterparty's behaviour when it was still ours: the
 * same misattribution class the journal work closed structurally rather than
 * by checklist.
 *
 * Every other gate here checks *the code*. Nothing checked that the running
 * process **is** the code. This module publishes the one fact that makes that
 * checkable, and it is durable well past the incident that prompted it: an
 * operator, a deployment check or a CI smoke test can read `/health/ready` and
 * see which commit the process in front of it actually booted from, rather than
 * which commit the checkout happens to be sitting on.
 *
 * ## Why this is resolved at module load and not per request
 *
 * Resolving lazily — on the first readiness request, or per request — would ask
 * git about the working tree *now* rather than about the process, so a service
 * booted before a commit would happily report the commit it never loaded. The
 * check would then pass in exactly the situation it exists to catch: a gate
 * that is tautologically green. Top-level resolution ties the answer to process
 * start structurally, so it cannot be undone by someone forgetting to call an
 * initialiser.
 *
 * ## Why `srcDirty` is scoped to `src/`
 *
 * A whole-tree `git status --porcelain` counts untracked files anywhere in the
 * checkout, and it has already spent its own meaning that way: every resolved
 * version was stamped `-dirty` because three fixture profiles for an unrelated
 * effort sat untracked, so the flag stopped saying anything. Scoped to `src/`
 * it means one thing — **the code this process loads is not the code at that
 * commit** — and an untracked `.ts` under `src/` is deliberately counted,
 * because it is loaded just as readily as a modified one.
 *
 * ## What this is not
 *
 * It is not a readiness *dependency*: nothing outside the process is touched,
 * and a process cannot know whether it is stale — staleness is a comparison
 * against a working tree only the caller can see. So provenance is reported as
 * a fact and never sets `ready`. Readiness states the shape of the deployment;
 * the caller judges that shape against whatever it expected to be running.
 */
import { gitIn, repoRoot, resolveServiceVersion } from './service-version.js'

export interface BootProvenance {
  /**
   * The **full** sha the process booted from. Full, not abbreviated: the
   * comparison is made by a shell script running `git rev-parse` on the other
   * side, and abbreviation length is a repo-wide setting that can differ from
   * whatever this process saw. Absent when git could not answer at all — an
   * unpacked deployment, or no git on the box.
   */
  gitSha?: string
  /** The same commit, abbreviated, for reading. */
  gitShaShort?: string
  /**
   * Was anything under `src/` modified or untracked at boot? When true the
   * commit above is a **lower bound**, not the truth: the process loaded code
   * that is not at that commit. Absent when git could not answer.
   */
  srcDirty?: boolean
  /** ISO-8601, from process start. */
  bootedAt: string
  /** So a stale process can be found and killed without guessing. */
  pid: number
  /**
   * The one-line `<name> <version> (git <sha>[-dirty])` citation, so a running
   * process and a checkout can be lined up by eye.
   */
  display: string
}

/**
 * Resolve provenance for `root`. Exported separately from the boot-time
 * constant purely so tests can drive it against a checkout they control — the
 * constant is what the endpoint serves, and it is resolved once, below.
 */
export const resolveBootProvenance = (
  root = repoRoot(),
  now = new Date(),
  pid = process.pid
): BootProvenance => {
  const version = resolveServiceVersion(root)
  const sha = gitIn(root, ['rev-parse', 'HEAD'])
  // Only asked when git could answer the first question; otherwise an empty
  // status would be indistinguishable from a clean tree.
  const status =
    sha === undefined ? undefined : gitIn(root, ['status', '--porcelain', '--', 'src'])

  return {
    ...(sha !== undefined ? { gitSha: sha } : {}),
    ...(version.gitSha !== undefined ? { gitShaShort: version.gitSha } : {}),
    ...(status !== undefined ? { srcDirty: status.length > 0 } : {}),
    bootedAt: now.toISOString(),
    pid,
    display: version.display
  }
}

/**
 * Resolved at import — that is, at boot. See the module comment: this being a
 * constant rather than a function call is the property the whole check rests
 * on.
 */
export const BOOT_PROVENANCE: BootProvenance = resolveBootProvenance()

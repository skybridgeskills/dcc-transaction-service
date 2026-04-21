import { parseArgs as nodeParseArgs } from 'node:util'
import { HttpExchangeClient } from '../lib/services/exchange-client/http-exchange-client'
import { exec } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const VALID_WORKFLOWS = ['didAuth', 'claim', 'verify'] as const

/**
 * Caller-friendly verifier-core options surfaced as CLI flags.
 *
 * - {@link verbose} (`-v` / `--verbose`) requests every check that
 *   ran on `results[]` instead of just failures + explicit skips.
 * - {@link timing} (`-t` / `--timing`) requests `TaskTiming`
 *   rollups on every check, suite, and call.
 *
 * Universally accepted across workflows even though only `verify`
 * forwards them to verifier-core today (see Q10 in
 * `docs/plans/2026-04-19-verifier-core-2-results-consumption/00-questions.md`).
 */
export interface VerifierCliOptions {
  verbose?: boolean
  timing?: boolean
}

export interface CliArgs {
  workflowId: string
  profileName: string
  open: boolean
  /**
   * CLI-set verifier options. **Only contains keys for flags
   * actually passed**; absent flags are omitted so they cannot
   * clobber a profile-set `true` value during merge in {@link main}.
   */
  options: VerifierCliOptions
}

/**
 * Parse the CLI argv. Returns `null` for `--help`, empty input, or
 * an invalid workflow id (the caller treats `null` as "exit 1
 * after printUsage / explanation").
 *
 * Uses `node:util.parseArgs` so cluster-form short flags (`-vt`)
 * and `--verbose=…`-style assignments work without bespoke
 * tokenizing.
 */
export function parseArgs(argv: string[]): CliArgs | null {
  const args = argv.slice(2)

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printUsage()
    return null
  }

  let parsed: ReturnType<typeof nodeParseArgs>
  try {
    parsed = nodeParseArgs({
      args,
      options: {
        open: { type: 'boolean', default: true },
        'no-open': { type: 'boolean', default: false },
        verbose: { type: 'boolean', short: 'v', default: false },
        timing: { type: 'boolean', short: 't', default: false }
      },
      allowPositionals: true
    })
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`)
    return null
  }

  const positional = parsed.positionals
  const workflowId = positional[0]
  if (!workflowId || !VALID_WORKFLOWS.includes(workflowId as never)) {
    console.error(
      `Error: invalid workflow "${workflowId}". Must be one of: ${VALID_WORKFLOWS.join(', ')}`
    )
    return null
  }

  const profileName = positional[1] ?? 'default'

  // `--no-open` wins if either form was passed; default is to open.
  const open = parsed.values['no-open'] === true ? false : true

  // Conditional spread keeps absent flags from later clobbering
  // profile-set `true` values during the merge in main().
  const options: VerifierCliOptions = {
    ...(parsed.values.verbose === true && { verbose: true }),
    ...(parsed.values.timing === true && { timing: true })
  }

  return { workflowId, profileName, open, options }
}

function printUsage() {
  console.log(`
Usage: pnpm transaction <workflowId> [profileName] [options]

  workflowId      One of: ${VALID_WORKFLOWS.join(', ')}
  profileName     Profile preset name (default: "default")

Options:
  --no-open       Don't auto-open the interaction URL in the browser
  -v, --verbose   Request unfolded verifier results (every check, not just failures)
  -t, --timing    Request timing data on every check, suite, and call

Environment variables:
  CLI_BASE_URL       Server base URL (default: http://localhost:4004)
  CLI_EXCHANGE_HOST  Public exchange host URL (default: server's DEFAULT_EXCHANGE_HOST)
  CLI_TENANT_TOKEN   Bearer token for tenant auth (optional)

Examples:
  pnpm transaction didAuth
  pnpm transaction claim ob3
  pnpm transaction verify ob3 --no-open
  pnpm transaction verify ob3 -vt
`)
}

export async function loadProfile(
  workflowId: string,
  profileName: string
): Promise<Record<string, unknown>> {
  const cliDir =
    typeof __dirname !== 'undefined'
      ? __dirname
      : dirname(fileURLToPath(import.meta.url))
  const profilePath = resolve(cliDir, 'profiles', workflowId, `${profileName}`)

  try {
    const mod = await import(profilePath)
    return mod.default ?? mod
  } catch {
    throw new Error(
      `Profile "${profileName}" not found for workflow "${workflowId}" (looked at ${profilePath})`
    )
  }
}

/**
 * Merge profile-supplied `options` with CLI-supplied `options` into
 * the final per-exchange `variables.options` payload. Pure so it can
 * be unit-tested without spinning up the whole CLI.
 *
 * CLI flags take precedence on a per-key basis, but {@link parseArgs}
 * only emits keys for flags that were actually passed — so a profile
 * setting (e.g. `options.verbose: true`) is preserved when the user
 * doesn't pass `-v`. Returns `undefined` instead of an empty object
 * so the schema's `optional` semantics stay exact.
 */
export function mergeVerifierOptions(
  profileVars: Record<string, unknown>,
  cliOptions: VerifierCliOptions
): VerifierCliOptions | undefined {
  const profileOptions =
    (profileVars.options as VerifierCliOptions | undefined) ?? {}
  const merged: VerifierCliOptions = { ...profileOptions, ...cliOptions }
  return Object.keys(merged).length > 0 ? merged : undefined
}

async function main() {
  const parsed = parseArgs(process.argv)
  if (!parsed) process.exit(1)

  const { workflowId, profileName, open, options } = parsed

  const baseUrl = process.env.CLI_BASE_URL ?? 'http://localhost:4004'
  const authToken = process.env.CLI_TENANT_TOKEN

  let profileVars: Record<string, unknown>
  try {
    profileVars = await loadProfile(workflowId, profileName)
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }

  const mergedOptions = mergeVerifierOptions(profileVars, options)
  const variables: Record<string, unknown> = {
    ...(process.env.CLI_EXCHANGE_HOST && {
      exchangeHost: process.env.CLI_EXCHANGE_HOST
    }),
    ...profileVars,
    ...(mergedOptions !== undefined && { options: mergedOptions })
  }

  console.log(`Creating ${workflowId} exchange (profile: ${profileName})...`)
  console.log(`  Server: ${baseUrl}`)

  const client = new HttpExchangeClient(baseUrl, authToken)

  try {
    const protocols = await client.createExchange(workflowId, variables)

    console.log(`\nExchange created!\n`)
    console.log(`  Interaction URL:  ${protocols.iu}`)
    console.log(`  VC-API endpoint:  ${protocols.vcapi}`)

    if (open) {
      console.log(`\nOpening in browser...`)
      exec(`open "${protocols.iu}"`)
    }
  } catch (e) {
    console.error(`\nFailed to create exchange: ${(e as Error).message}`)
    process.exit(1)
  }
}

const isCli =
  process.argv[1]?.endsWith('/cli.ts') ||
  process.argv[1]?.endsWith('/cli.js')

if (isCli) {
  main()
}

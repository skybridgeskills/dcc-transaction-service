import { HttpExchangeClient } from '../lib/services/exchange-client/http-exchange-client'
import { exec } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const VALID_WORKFLOWS = ['didAuth', 'claim', 'verify'] as const

interface CliArgs {
  workflowId: string
  profileName: string
  open: boolean
}

export function parseArgs(argv: string[]): CliArgs | null {
  const args = argv.slice(2)

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printUsage()
    return null
  }

  const open = !args.includes('--no-open')
  const positional = args.filter((a) => !a.startsWith('--'))

  const workflowId = positional[0]
  if (!workflowId || !VALID_WORKFLOWS.includes(workflowId as any)) {
    console.error(
      `Error: invalid workflow "${workflowId}". Must be one of: ${VALID_WORKFLOWS.join(', ')}`
    )
    return null
  }

  const profileName = positional[1] ?? 'default'

  return { workflowId, profileName, open }
}

function printUsage() {
  console.log(`
Usage: pnpm transaction <workflowId> [profileName] [--no-open]

  workflowId   One of: ${VALID_WORKFLOWS.join(', ')}
  profileName  Profile preset name (default: "default")
  --no-open    Don't auto-open the interaction URL in the browser

Environment variables:
  CLI_BASE_URL       Server base URL (default: http://localhost:4004)
  CLI_EXCHANGE_HOST  Public exchange host URL (default: server's DEFAULT_EXCHANGE_HOST)
  CLI_TENANT_TOKEN   Bearer token for tenant auth (optional)

Examples:
  pnpm transaction didAuth
  pnpm transaction claim ob3
  pnpm transaction verify ob3 --no-open
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

async function main() {
  const parsed = parseArgs(process.argv)
  if (!parsed) process.exit(1)

  const { workflowId, profileName, open } = parsed

  const baseUrl = process.env.CLI_BASE_URL ?? 'http://localhost:4004'
  const authToken = process.env.CLI_TENANT_TOKEN

  let profileVars: Record<string, unknown>
  try {
    profileVars = await loadProfile(workflowId, profileName)
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }

  const variables: Record<string, unknown> = {
    ...(process.env.CLI_EXCHANGE_HOST && { exchangeHost: process.env.CLI_EXCHANGE_HOST }),
    ...profileVars
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

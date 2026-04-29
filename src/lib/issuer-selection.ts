import { arrayOf } from '../utils.js'

/** Newest-first preference when choosing among issuer instances. */
export const CRYPTOSUITE_PRIORITY = [
  'eddsa-rdfc-2022',
  'ecdsa-rdfc-2019',
  'ed25519-signature-2020'
] as const

function cryptosuiteRank(cryptosuite: string): number {
  const i = CRYPTOSUITE_PRIORITY.indexOf(
    cryptosuite as (typeof CRYPTOSUITE_PRIORITY)[number]
  )
  return i === -1 ? CRYPTOSUITE_PRIORITY.length + 1 : i
}

function sortIssuerInstancesByPriority(
  instances: App.IssuerInstance[]
): App.IssuerInstance[] {
  return [...instances].sort(
    (a, b) => cryptosuiteRank(a.cryptosuite) - cryptosuiteRank(b.cryptosuite)
  )
}

/**
 * Choose an issuer instance for signing. Prefer instances whose cryptosuite appears in the
 * wallet's presentation; otherwise fall back to all tenant instances. Within each pool, pick
 * the newest supported cryptosuite first.
 */
export function selectIssuerInstance(
  tenant: Pick<App.Tenant, 'issuerInstances'>,
  walletPresentationCryptosuites?: string[]
): App.IssuerInstance | null {
  const instances = tenant.issuerInstances ?? []
  if (instances.length === 0) {
    return null
  }

  const wallet = walletPresentationCryptosuites?.filter(Boolean) ?? []
  if (wallet.length > 0) {
    const matching = instances.filter((i) => wallet.includes(i.cryptosuite))
    if (matching.length > 0) {
      return sortIssuerInstancesByPriority(matching)[0]
    }
  }

  return sortIssuerInstancesByPriority(instances)[0]
}

function collectCryptosuitesFromProof(proof: unknown): string[] {
  if (!proof) return []
  const list = arrayOf(proof as Record<string, unknown> | Record<string, unknown>[])
  const out: string[] = []
  for (const p of list) {
    if (!p || typeof p !== 'object') continue
    const o = p as Record<string, unknown>
    if (typeof o.cryptosuite === 'string') {
      out.push(o.cryptosuite)
    }
    if (o.type === 'Ed25519Signature2020') {
      out.push('ed25519-signature-2020')
    }
  }
  return out
}

/**
 * Read cryptosuites from the holder presentation proof(s) (wallet preference signal).
 */
export function extractWalletCryptosuitesFromPresentation(
  data: unknown
): string[] {
  if (!data || typeof data !== 'object') {
    return []
  }
  const root = data as Record<string, unknown>
  const inner =
    root.verifiablePresentation && typeof root.verifiablePresentation === 'object'
      ? (root.verifiablePresentation as Record<string, unknown>)
      : root
  return [...new Set(collectCryptosuitesFromProof(inner.proof))]
}

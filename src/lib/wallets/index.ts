/**
 * The wallet product table: product name → construction → profile.
 *
 * ⚠️ **A lookup, never a decision.** Nothing here changes what the service
 * emits. A product missing from the table, or carrying no profile, resolves to
 * the service default — which is the normal path, not a degraded one. **Absence
 * is never an error**, because a stale table that threw would take a deployment
 * down over a vendor renaming an app.
 *
 * @see wallet-schema.ts — why this table is expected to go stale
 * @see link-constructions.ts — the shapes, named for the shape and not the vendor
 */
import { lcw } from './lcw.js'
import { asuPocket } from './asuPocket.js'
import { mySkillsPocket } from './mySkillsPocket.js'
import { learnCard } from './learnCard.js'
import {
  buildWalletLink,
  type WalletLinkConstruction,
  type WalletLinkInputs
} from './link-constructions.js'
import type { Wallet } from './wallet-schema.js'

export const wallets: Wallet[] = [lcw, asuPocket, mySkillsPocket, learnCard]

/**
 * ⚠️ Every lookup takes an injectable registry, defaulting to the shipped
 * table — the same shape the protocol profile registry uses, and for the same
 * reason: a test exercises the construction that ships rather than a parallel
 * one, and nothing is tempted to mutate the real table to make a case pass.
 */
export const getWallet = (
  id: string,
  registry: Wallet[] = wallets
): Wallet | undefined => registry.find((w) => w.id === id)

/**
 * One spelling of a name, reduced to what a human meant by it.
 *
 * ⚠️ **One function, read by both {@link findWalletByName} and
 * {@link walletMatchScore}.** Two normalisations would let an exact lookup and
 * a search disagree about whether a name is a name — `LCW` resolving in one and
 * not the other — and the disagreement would surface as a product that is
 * findable by typing but not by asking. Derived, never copied.
 */
const normalise = (s: string): string => s.toLowerCase().replace(/[\s_-]+/g, '')

/**
 * Find a product by anything a human might type — its id, its display name, or
 * a name it also ships under.
 *
 * ⚠️ Case- and space-insensitive on purpose: an operator reading a name off a
 * launcher types what they see, not a slug.
 *
 * ⚠️ **An EXACT lookup: one query, one product or none.** Do not fold
 * {@link searchWallets}'s substring matching in here. A caller asking *"is this
 * the product?"* would start getting *"here is something a bit like it"*, and
 * this table's entire safety property is that it is a lookup, never a decision.
 */
export const findWalletByName = (
  query: string,
  registry: Wallet[] = wallets
): Wallet | undefined => {
  const target = normalise(query)
  return registry.find(
    (w) =>
      normalise(w.id) === target ||
      normalise(w.name) === target ||
      (w.aliases ?? []).some((a) => normalise(a) === target)
  )
}

/**
 * How well `query` matches a product. `0` is no match; higher is better.
 *
 * ## The defect this exists for
 *
 * {@link findWalletByName} compares for **equality**, so it resolves `LCW` and
 * `Learner Credential Wallet` and **nothing in between**. An operator typing
 * `Learne`, or a user typing `credential wallet`, gets nothing — which on screen
 * is indistinguishable from a product that is genuinely absent.
 *
 * ⚠️ **That is the one confusion "absence is never an error" cannot absorb.**
 * *Not in the table* and *you have not finished typing* must not look the same.
 * The table's whole design is that a miss is normal and harmless, and that only
 * works while a miss means what it says.
 *
 * ## The rank, and why description is last
 *
 * Exact id/name/alias → prefix → substring → description.
 *
 * ⚠️ **Description is matched because the table already ships the text** — ASU
 * Pocket's says *"Arizona State University"* — and refusing to search words we
 * shipped is a worse answer than ranking them low. It is last because a
 * description match is a weak signal: it can hit a word the vendor never uses as
 * a name.
 */
export const walletMatchScore = (query: string, w: Wallet): number => {
  const q = normalise(query)
  if (!q) return 0
  const names = [w.id, w.name, ...(w.aliases ?? [])].map(normalise)
  if (names.some((n) => n === q)) return 4
  if (names.some((n) => n.startsWith(q))) return 3
  if (names.some((n) => n.includes(q))) return 2
  if (w.description && normalise(w.description).includes(q)) return 1
  return 0
}

/**
 * Products matching `query`, best first.
 *
 * ⚠️ **An empty query matches nothing, and a miss is not an error.** Both are
 * the same rule as the rest of this module: a caller with nothing to offer says
 * so by having none.
 *
 * ⚠️ Ties keep the table's own order, which is stable across builds — a picker
 * whose rows reshuffled between renders is the defect `App.tsx` already carries
 * a comment about.
 */
export const searchWallets = (
  query: string,
  registry: Wallet[] = wallets
): Wallet[] =>
  registry
    .map((w, index) => ({ w, index, score: walletMatchScore(query, w) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ w }) => w)

/**
 * The protocol profile a product is known to work with, or `undefined`.
 *
 * ⚠️ **Total, and never throws.** `undefined` means "use the service default",
 * which is what a product absent from the table gets and what most products
 * should get. Returning a guess here would let a stale table start changing
 * bytes, which is the one thing this split exists to prevent.
 */
export const protocolProfileForProduct = (
  productId: string,
  registry: Wallet[] = wallets
): string | undefined => getWallet(productId, registry)?.protocolProfileName

/**
 * Build a product's convenience link in the given shape.
 *
 * Returns `undefined` when the product is unknown, or does not accept that
 * shape — a caller with no link to offer says so by having none, not by
 * offering a broken one.
 */
export const walletLinkFor = (
  productId: string,
  construction: WalletLinkConstruction,
  inputs: WalletLinkInputs,
  registry: Wallet[] = wallets
): string | undefined => {
  const link = getWallet(productId, registry)?.links.find(
    (l) => l.construction === construction
  )
  return link && buildWalletLink(construction, link.base, inputs)
}

/** The shape a product prefers — what the interaction page builds when a user picks it. */
export const preferredConstructionFor = (
  productId: string,
  registry: Wallet[] = wallets
): WalletLinkConstruction | undefined =>
  getWallet(productId, registry)?.links[0]?.construction

export {
  WALLET_LINK_CONSTRUCTIONS,
  buildWalletLink,
  type WalletLinkConstruction,
  type WalletLinkInputs
} from './link-constructions.js'
export type { Wallet } from './wallet-schema.js'

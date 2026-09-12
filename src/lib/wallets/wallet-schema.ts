/**
 * A wallet PRODUCT: who it is, where its links point, and which protocol
 * profile it is known to work with.
 *
 * ⚠️ **Data only. No functions, no URL building, no branching on product.**
 * Shapes live in `link-constructions.ts`; what this service emits lives in
 * protocol profiles. This file is the third thing — the part that maps a name a
 * human types to a construction a machine speaks.
 *
 * ⚠️ **This table is EXPECTED to go stale, and that is the design.** A vendor
 * renames an app, ships a new scheme, or changes which profile it works with,
 * and this file is wrong until somebody fixes it. That is a good trade: it is
 * cheap to fix, obviously wrong when wrong, and — the part that matters — **a
 * pull request against it cannot change what the service emits.** That is what
 * makes it safe to take a correction from a vendor or the community without
 * giving anyone a say over the wire.
 */
import type { WalletLinkConstruction } from './link-constructions.js'

export interface Wallet {
  /** Stable handle. Also the id the interaction page's picker uses. */
  id: string
  /** Display name. */
  name: string
  /**
   * Other names this product ships or has shipped under, for search.
   *
   * ⚠️ Matched case-insensitively and never shown. Their whole job is to make a
   * name a human actually types resolve — including names a vendor has since
   * dropped, because an operator with an older device still reads the old one
   * on the launcher.
   */
  aliases?: string[]
  description?: string
  /**
   * The shapes this product accepts and where each points, **most preferred
   * first**.
   *
   * ⚠️ **An ordered list of pairs, not a base plus a list of shapes**, because
   * one product's two shapes point at two different paths on the same host —
   * `/request` for one and `/request.html` for the other. A single base would
   * have quietly built one of them wrong, and it is a legacy URL cited by
   * recorded runs.
   *
   * ⚠️ `base` is **product identity, not construction**: a vendor's own address
   * is about as literally "who they are" as a field gets. The SHAPE built on
   * top of it lives in `link-constructions.ts` and is shared with every other
   * product that speaks it.
   *
   * Which shape gets used is decided by the active protocol profile per
   * workflow, not here — which is why this is a list and not a single value.
   */
  links: Array<{ construction: WalletLinkConstruction; base: string }>
  /**
   * The protocol profile this product is known to work with, if any.
   *
   * ⚠️ **Absence is never an error.** A product with no entry — or no product
   * entry at all — falls back to the service default, which is the normal path.
   * Guessing on a product's behalf is how a stale table starts changing bytes.
   */
  protocolProfileName?: string
}

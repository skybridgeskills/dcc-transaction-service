/**
 * The cryptosuites this verifier can actually verify.
 *
 * THE RULE THIS FILE ENFORCES — *the advertised acceptance equals the actual
 * acceptance, and the actual acceptance is as wide as the spec allows.* The
 * VPR once advertised `ecdsa-rdfc-2019` while verifier-core registered
 * `Ed25519Signature2020` and `eddsa-rdfc-2022` and nothing else, so a wallet
 * that took us at our word earned a failure for a gap that was ours.
 * Anything named in {@link VERIFIABLE_CRYPTOSUITES} — which is what the VPR
 * advertises — MUST have a verifying suite here.
 *
 * `ecdsa-sd-2023` is the deliberate exception in the other direction: it is
 * **verifiable here, never advertised, and un-invitable.** Advertising it would
 * invite every wallet to derive a selective-disclosure proof, silently changing
 * what every exchange observes — so it stays out of
 * {@link VERIFIABLE_CRYPTOSUITES}, and ⚠️ **no per-exchange knob may union it
 * into the advertised set either** (see
 * `docs/adr/2026-09-10-advertised-acceptance-equals-actual.md`). The asymmetry
 * that remains is the safe one — we can check a proof we never asked for.
 *
 * ⚠️ Do not "tidy" the registration below away because nothing advertises the
 * suite. A wallet may derive unprompted, and `verifier-acceptance.test.ts`
 * verifies a derived proof against it.
 */
import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020'
import { DataIntegrityProof } from '@digitalcredentials/data-integrity'
import { cryptosuite as eddsaRdfc2022 } from '@digitalcredentials/eddsa-rdfc-2022-cryptosuite'
import * as ecdsaRdfc2019 from '@digitalbazaar/ecdsa-rdfc-2019-cryptosuite'
import * as ecdsaSd2023 from '@digitalbazaar/ecdsa-sd-2023-cryptosuite'
import {
  DataIntegrityCryptoService,
  type CryptoService,
  type CryptoSuite
} from '@digitalcredentials/verifier-core'

/**
 * Every suite this verifier can check a proof with.
 *
 * Exported separately from {@link verifierCryptoServices} because
 * `DataIntegrityCryptoService` closes over its suites and exposes nothing —
 * once wrapped, the set is unreadable. The invariant at the top of this file
 * is only enforceable if something can still read the list, so the list is
 * the exported thing and the service is built from it.
 */
export const verifyingSuites = (): CryptoSuite[] => [
  new Ed25519Signature2020(),
  new DataIntegrityProof({ cryptosuite: eddsaRdfc2022 }),
  new DataIntegrityProof({ cryptosuite: ecdsaRdfc2019.cryptosuite }),
  // Verify-only: a derived proof is checked, never created, here.
  new DataIntegrityProof({ cryptosuite: ecdsaSd2023.createVerifyCryptosuite() })
]

/**
 * Construct the verifying suite set. Built once per verifier singleton;
 * the suites carry no cross-call state.
 */
export const verifierCryptoServices = (): CryptoService[] => [
  DataIntegrityCryptoService({ suites: verifyingSuites() })
]

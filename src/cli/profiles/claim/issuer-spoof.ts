/**
 * Negative fixture — the **spoofed source** arm.
 *
 * A correctly-issued credential whose `issuer.id` is substituted AFTER signing
 * (`tamper: 'issuer'`) for a DID that **does resolve** and that did **not** sign
 * it. A wallet can fetch the named issuer's DID document, find its keys, and
 * discover that none of them made this proof.
 *
 * Expected wallet behaviour: reject. Accepting it silently means the wallet
 * checks that a proof verifies without checking WHO made it.
 *
 * ## ⚠️ The property that makes this arm different, and how it breaks
 *
 * The ONLY thing separating this from `issuer-unresolvable` is that this DID
 * **resolves**. Catching a spoof is a strictly stronger result than failing
 * closed on a DID that will not resolve — so **if this DID stops resolving, the
 * two arms silently collapse into one test** and whichever is run second buys
 * nothing.
 *
 * ⛔ **Confirm it resolves before a run; do not assume it.** It is published by
 * this transaction service at `/ui/spoof-issuer/did.json`, derived by the
 * signing service from its own tenant — so it is down whenever the local stack
 * is down. The identity is derived from the configured exchange host rather
 * than written down; see `../../test-issuer.js` for what to configure.
 *
 * ## Why a tenant of our own and not a real third-party issuer
 *
 * A resolvable third-party DID would be a more lifelike spoof, but it would put
 * a credential falsely claiming that party's identity into other people's
 * wallets and their server-side telemetry. The rule is deliberate: a real,
 * fetchable `did:web` **we control** that did not sign this credential.
 *
 * ⚠️ Aimed exclusively at credentials this service issues itself. A negative
 * fixture is only ever pointed at our own identity.
 */
import type { ProfileVariables } from '../../types.js'
import { SPOOF_ISSUER, TEST_ISSUER_NAME } from '../../test-issuer.js'

/**
 * ⚠️ Resolvable and NOT the signer. The other fixtures are signed as the
 * tenant's own issuer instance; this is a separate identity that issues
 * nothing. `tamper: 'issuer'` refuses to build the fixture if the two ever
 * converge.
 */
const SPOOF_ISSUER_DID = SPOOF_ISSUER.did

const NONCE = crypto.randomUUID()
const MARKER = `TEST-MARKER:issuerspoof-${NONCE.slice(0, 8)}-${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}`

const vc = {
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
  ],
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  id: `urn:uuid:test-issuerspoof-${NONCE}`,
  name: `Test Credential — ${MARKER}`,
  // ⚠️ This id is what `tamper: 'issuer'` restores after signing. On every
  // other path the signing service overwrites it and it is discarded.
  //
  // The display metadata below is deliberately plausible: the fixture is about
  // what a human reading the credential card would believe, and a wallet that
  // shows a trustworthy-looking issuer name while the proof is by someone else
  // is exactly the condition being tested.
  issuer: {
    id: SPOOF_ISSUER_DID,
    type: 'Profile',
    name: TEST_ISSUER_NAME,
    url: SPOOF_ISSUER.url,
    description:
      'Negative fixture issuer — resolvable, and did not sign this credential.'
  },
  validFrom: '2026-08-08T00:00:00Z',
  credentialSubject: {
    type: 'AchievementSubject',
    // id bound at claim time to holder DID
    achievement: {
      id: 'urn:uuid:test-achievement-skills',
      type: 'Achievement',
      achievementType: 'Achievement',
      name: 'Test Achievement',
      description: `Sample achievement carried by the test fixtures. ${MARKER}`,
      criteria: {
        narrative:
          'Awarded on completion of the sample activity this fixture stands for.'
      }
    }
  }
}

const profile: ProfileVariables = {
  vc: JSON.stringify(vc),
  tamper: 'issuer'
}

export default profile

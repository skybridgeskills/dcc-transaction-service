/**
 * Negative fixture — the **untrusted / unresolvable issuer** arm.
 *
 * A correctly-issued credential whose `issuer.id` is substituted AFTER signing
 * (`tamper: 'issuer'`) for a DID that **cannot be resolved at all**. The proof
 * is intact and was made by the real signer; the named issuer is a DID no
 * wallet can fetch a key for.
 *
 * Expected wallet behaviour: reject.
 *
 * ## ⚠️ Why this is the SECOND arm and not the only one
 *
 * A wallet that refuses this has proved only that it fails closed when a DID
 * will not resolve — which is weaker than checking WHO signed. The spoof arm
 * (`issuer-spoof`) names a DID that **does** resolve, and catching that is the
 * stronger result. ⚠️ **If the spoof arm's DID ever stops resolving, these two
 * arms collapse into the same test and one of the two runs is wasted.**
 *
 * `.invalid` is reserved by RFC 2606 and is guaranteed never to resolve, so
 * this arm cannot decay into the spoof arm by accident.
 *
 * ⚠️ Aimed exclusively at credentials this service issues itself. A negative
 * fixture is only ever pointed at our own identity.
 */
import type { ProfileVariables } from '../../types.js'

/** ⚠️ RFC 2606 reserved TLD — guaranteed unresolvable, by construction. */
const UNRESOLVABLE_ISSUER = 'did:web:issuer-not-known.invalid'

const NONCE = crypto.randomUUID()
const MARKER = `TEST-MARKER:issuerunres-${NONCE.slice(0, 8)}-${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}`

const vc = {
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
  ],
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  id: `urn:uuid:test-issuerunres-${NONCE}`,
  name: `Test Credential — ${MARKER}`,
  // ⚠️ This id is what `tamper: 'issuer'` restores after signing. On every
  // other path the signing service overwrites it and it is discarded.
  issuer: {
    id: UNRESOLVABLE_ISSUER,
    type: 'Profile',
    name: 'Unknown Issuer',
    url: 'https://issuer-not-known.invalid/',
    description: 'Negative fixture issuer — deliberately unresolvable.'
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

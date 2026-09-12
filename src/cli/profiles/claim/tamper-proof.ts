/**
 * Negative fixture — a correctly-issued credential whose PROOF is corrupted
 * after signing (`tamper: 'proof'`).
 *
 * The credential is issued normally and then one character of
 * `proof.proofValue` is flipped, so the value keeps its length and multibase
 * prefix and the failure is a SIGNATURE failure rather than a parse failure.
 *
 * Expected wallet behaviour: reject. A wallet that accepts this is not
 * verifying the proof at all.
 *
 * Pairs with `tamper-claim`, which breaks the payload instead. Both exist
 * because a wallet that only checks a proof is present and well-formed passes
 * one and fails the other.
 *
 * ⚠️ Aimed exclusively at credentials this service issues itself. A negative
 * fixture is only ever pointed at our own identity.
 */
import type { ProfileVariables } from '../../types.js'
import { TEST_ISSUER, TEST_ISSUER_NAME } from '../../test-issuer.js'

const NONCE = crypto.randomUUID()
const MARKER = `TEST-MARKER:tamperproof-${NONCE.slice(0, 8)}-${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}`

const vc = {
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
  ],
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  id: `urn:uuid:test-tamperproof-${NONCE}`,
  name: `Test Credential — ${MARKER}`,
  issuer: {
    id: TEST_ISSUER.did,
    type: 'Profile',
    name: TEST_ISSUER_NAME,
    url: TEST_ISSUER.url,
    description: 'Controlled issuer identity used by the test fixtures.'
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
      },
      // Example-domain placeholders; the member is carried because wallets
      // render, ignore or choke on it, not because the targets mean anything.
      alignment: [
        {
          type: 'Alignment',
          targetUrl: 'https://example.org/frameworks/sample/competency-1',
          targetName: 'Sample Competency',
          targetDescription: 'A placeholder competency for fixture purposes',
          targetFramework: 'Sample Competency Framework',
          targetCode: 'SAMPLE-1',
          targetType: 'ceasn:Competency'
        }
      ]
    }
  }
}

const profile: ProfileVariables = {
  vc: JSON.stringify(vc),
  tamper: 'proof'
}

export default profile

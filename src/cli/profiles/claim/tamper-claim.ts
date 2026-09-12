/**
 * Negative fixture — a correctly-issued credential whose PAYLOAD is corrupted
 * after signing (`tamper: 'claim'`), leaving the proof untouched.
 *
 * The signature is intact and well-formed; it simply no longer matches the
 * content it covers.
 *
 * Expected wallet behaviour: reject. A wallet that accepts this is checking
 * that a proof EXISTS rather than that it VERIFIES — which is precisely the
 * failure mode `tamper-proof` cannot detect on its own.
 *
 * ⚠️ Aimed exclusively at credentials this service issues itself. A negative
 * fixture is only ever pointed at our own identity.
 */
import type { ProfileVariables } from '../../types.js'
import { TEST_ISSUER, TEST_ISSUER_NAME } from '../../test-issuer.js'

const NONCE = crypto.randomUUID()
const MARKER = `TEST-MARKER:tamperclaim-${NONCE.slice(0, 8)}-${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}`

const vc = {
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
  ],
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  id: `urn:uuid:test-tamperclaim-${NONCE}`,
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
  tamper: 'claim'
}

export default profile

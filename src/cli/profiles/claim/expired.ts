/**
 * Negative fixture — a correctly-signed credential that is EXPIRED.
 *
 * Deliberately NOT a tamper fixture: the signature verifies, the payload is
 * intact, and only the validity window is bad. A wallet may reasonably accept
 * it and flag it rather than reject outright, and that is a different finding
 * from a signature failure — which is why this is kept separate from the two
 * tamper profiles rather than folded in with them.
 *
 * ⚠️ Aimed exclusively at credentials this service issues itself. A negative
 * fixture is only ever pointed at our own identity.
 */
import type { ProfileVariables } from '../../types.js'
import { TEST_ISSUER, TEST_ISSUER_NAME } from '../../test-issuer.js'

const NONCE = crypto.randomUUID()
const MARKER = `TEST-MARKER:expired-${NONCE.slice(0, 8)}-${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}`

const vc = {
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
  ],
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  id: `urn:uuid:test-expired-${NONCE}`,
  name: `Test Credential — ${MARKER}`,
  issuer: {
    id: TEST_ISSUER.did,
    type: 'Profile',
    name: TEST_ISSUER_NAME,
    url: TEST_ISSUER.url,
    description: 'Controlled issuer identity used by the test fixtures.'
  },
  validFrom: '2020-01-01T00:00:00Z',
  validUntil: '2020-12-31T23:59:59Z',
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
  vc: JSON.stringify(vc)
}

export default profile

/**
 * OB 3.0 claim fixture on **VCDM 2.0**, issued by a path-form `did:web`
 * identity with a service-attached status entry.
 *
 * Deliberately distinct from `ob3.ts`, which is VCDM 1.1, a `did:key` issuer
 * and no credential status. Both are worth keeping: a wallet can render one and
 * fail the other, and the three differences are exactly the ones that separate
 * a modern issuance from the oldest shape still in the wild.
 *
 * The marker value and the credential `id` are **stamped fresh at load time**.
 * Reusing a credential `id` across exchanges makes the claim fail with a bare
 * 500 that is indistinguishable from a wallet defect, and a hand-driven test
 * run mints too often for a manual ritual to survive. `urn:uuid:` accepts any
 * uuid, so generation is free.
 *
 * Requires a signing tenant configured for a path-form `did:web`:
 *   TENANT_DIDMETHOD_<t>=web
 *   TENANT_DID_URL_<t>=<exchange host>/ui/<path segment>
 * The DID document is then published by this service at that path; see
 * `src/lib/did-web-document.ts`. The issuer identity below is derived from the
 * configured exchange host rather than written down — see `../../test-issuer.js`.
 *
 * No hand-crafted `credentialStatus`: the status service attaches a
 * `BitstringStatusListEntry` during claim, via the pre-signing allocate hook.
 * Requires STATUS_SERVICE + STATUS_SERVICE_TOKEN in this service's env.
 *
 * ⚠️ `@context` must NOT list https://www.w3.org/ns/credentials/status/v1.
 * VCDM 2.0 already defines the entry terms, and the older status context
 * redefines them — the signing service rejects the credential with "Invalid
 * JSON-LD syntax; tried to redefine a protected term" and nothing issues.
 * Allocate does not touch a caller's contexts, so the profile has to be right
 * on its own.
 */
import type { ProfileVariables } from '../../types.js'
import { TEST_ISSUER, TEST_ISSUER_NAME } from '../../test-issuer.js'

const NONCE = crypto.randomUUID()
const MARKER = `TEST-MARKER:${NONCE.slice(0, 8)}-${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}`

const vc = {
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
  ],
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  id: `urn:uuid:${NONCE}`,
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
      // An `alignment` member is carried deliberately: it is an optional array
      // of objects that several wallets render, ignore or choke on, and its
      // presence is part of what this fixture exercises. The targets are
      // example-domain placeholders and make no real-world claim.
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

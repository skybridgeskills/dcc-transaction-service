/**
 * A total {@link ProtocolProfile} used only by tests.
 *
 * ⚠️ **This is NOT a profile this service serves, and its name says so.**
 * `example-…` is not a construction anybody can cite; the profiles that
 * reproduce what this service actually emits are authored into the registry
 * against a byte-for-byte capture, which is a separate exercise with a separate
 * review. A fixture that looked like a real profile would eventually be used as
 * one.
 *
 * Every field is stated, because that is the property under test: a test helper
 * that filled gaps would be testing the helper.
 */
import type { ProtocolProfile, WorkflowWireProfile } from './types.js'

// ⚠️ Coherent as well as total. The combination rules in `coherence.ts` apply
// to a fixture exactly as they do to a shipped profile, and they should: a
// fixture that stated a key set or a flag the code never emits would be testing
// the schema against a profile no deployment could run.
const envelope = {
  interactionUrlKeys: ['iu'],
  vcapiKeys: ['vcapi'],
  walletConvenienceKeys: ['lcw'],
  oid4vpKeys: [],
  oid4vciKeys: [],
  emitVerifiablePresentationRequest: true,
  walletConvenienceConstruction: 'issuer-auth-challenge-query' as const
}

const didAuthVpr = {
  interactServices: [
    'VerifiableCredentialApiExchangeService' as const,
    'UnmediatedPresentationService2021' as const,
    'CredentialHandlerService' as const
  ],
  domainForm: 'exchange-host' as const,
  emitAcceptedCryptosuites: true,
  emitDidAuthenticationAcceptedCryptosuites: false,
  acceptedMethodsForm: 'bare-name' as const,
  acceptedMethods: []
}

const verifyVpr = {
  interactServices: [
    'VerifiableCredentialApiExchangeService' as const,
    'UnmediatedPresentationService2021' as const
  ],
  domainForm: 'service-endpoint' as const,
  emitAcceptedCryptosuites: true,
  emitDidAuthenticationAcceptedCryptosuites: true,
  acceptedMethodsForm: 'bare-name' as const,
  acceptedMethods: ['key', 'web', 'jwk']
}

const vprOnly: WorkflowWireProfile = {
  envelope,
  vpr: didAuthVpr,
  oid4vp: null,
  oid4vci: null,
  issuance: null
}

/**
 * ⚠️ **Deep-cloned on every call.** The branches below share fragments — which
 * is how a profile is authored — and a test that mutates one nested object
 * would otherwise change the fixture for every test that ran after it, in file
 * order. That failure is invisible until it is not: a rule fires on a branch
 * the test never touched, and the test that actually broke it has already
 * passed.
 */
export const exampleProfile = (
  overrides: Partial<ProtocolProfile> = {}
): ProtocolProfile =>
  structuredClone({
  name: 'example-1.0-by-reference-redirect-uri',
  description: 'Test fixture. Not a served profile.',
  workflows: {
    claim: {
      ...vprOnly,
      envelope: { ...envelope, oid4vciKeys: ['OID4VCI'] },
      oid4vci: {
        version: '1.0',
        deepLinkScheme: 'openid-credential-offer',
        offerDelivery: 'by-reference',
        grants: ['pre-authorized-code']
      },
      issuance: { mediaType: 'application/vc', envelope: 'none' }
    },
    didAuth: vprOnly,
    verify: {
      ...vprOnly,
      envelope: {
        ...envelope,
        oid4vpKeys: ['OID4VP'],
        walletConvenienceConstruction: 'protocols-json-query' as const
      },
      vpr: verifyVpr,
      oid4vp: {
        version: '1.0',
        deepLinkScheme: 'openid4vp',
        delivery: 'by-reference',
        queryLanguage: 'dcql',
        clientIdPrefix: 'redirect-uri',
        emitClientIdScheme: false,
        requestObjectFormat: 'json',
        requestUriMethod: 'none',
        responseMode: 'direct_post',
        emitResponseUri: true,
        requireSignedRequestObject: 'omitted',
        limitDisclosure: 'none',
          expectedOrigins: 'omitted'
      }
    }
  },
  ...overrides
  })

/**
 * Pure handler for the OID4VCI Credential Endpoint (§8). Validates a
 * Bearer access token, the request shape, and a `proofs.di_vp[0]` key
 * proof — a Verifiable Presentation containing a DIDAuthentication
 * proof bound to the exchange's previously-issued `c_nonce` — then
 * defers to the shared {@link signClaimCredentialFromHolderDid} helper
 * to render, sign, and persist the credential.
 *
 * Returns the OID4VCI 1.0 §8.3 response shape:
 *
 *   { credentials: [{ credential: <signed VC> }] }
 *
 * or a spec-shaped error response (§8.3.1).
 */
import { extractWalletCryptosuitesFromPresentation } from '../lib/issuer-selection.js'
import { extractHolderDid } from '../lib/data/verifiable-presentation/extract-holder-did.js'
import { verifyDIDAuth } from '../didAuth.js'
import { signClaimCredentialFromHolderDid } from '../workflows/claimWorkflow.js'
import { deriveCredentialConfigurationId } from './credential-offer.js'
import {
  credentialRequestSchema,
  type CredentialErrorCode,
  type CredentialErrorResponse,
  type CredentialResponse
} from './schemas.js'
import { validateAccessToken, validateAndConsumeNonce } from './state.js'

export type CredentialHandlerOk = {
  ok: true
  exchange: App.ExchangeDetailClaim
  response: CredentialResponse
}

export type CredentialHandlerErr = {
  ok: false
  status: 400 | 401
  body: CredentialErrorResponse | { error: 'invalid_token'; error_description?: string }
}

export type CredentialHandlerResult = CredentialHandlerOk | CredentialHandlerErr

const err = (
  status: 400,
  error: CredentialErrorCode,
  description: string
): CredentialHandlerErr => ({
  ok: false,
  status,
  body: { error, error_description: description }
})

const unauthorized = (description: string): CredentialHandlerErr => ({
  ok: false,
  status: 401,
  body: { error: 'invalid_token', error_description: description }
})

/**
 * The challenge a Data Integrity VP commits to when used as an OID4VCI
 * key proof. We accept it on either the top-level `challenge` (some
 * libraries surface it there for VPRs) or — more canonically for a DI
 * VP — on `proof.challenge`.
 */
const extractVpChallenge = (vp: Record<string, unknown>): string | undefined => {
  const top = (vp as { challenge?: unknown }).challenge
  if (typeof top === 'string') return top
  const proof = (vp as { proof?: unknown }).proof
  if (Array.isArray(proof)) {
    for (const p of proof) {
      const c = (p as { challenge?: unknown }).challenge
      if (typeof c === 'string') return c
    }
    return undefined
  }
  if (proof && typeof proof === 'object') {
    const c = (proof as { challenge?: unknown }).challenge
    if (typeof c === 'string') return c
  }
  return undefined
}

export const handleCredentialRequest = async ({
  accessToken,
  body,
  exchange,
  workflow,
  config
}: {
  accessToken: string | undefined
  body: unknown
  exchange: App.ExchangeDetailClaim
  workflow: App.Workflow
  config: App.Config
}): Promise<CredentialHandlerResult> => {
  if (!accessToken) {
    return unauthorized('Missing Bearer access token.')
  }
  const tokenCheck = validateAccessToken(exchange, accessToken)
  if (!tokenCheck.ok) {
    return unauthorized(tokenCheck.reason)
  }

  const parsed = credentialRequestSchema.safeParse(body)
  if (!parsed.success) {
    return err(400, 'invalid_credential_request', 'Credential request body is malformed.')
  }
  const req = parsed.data

  const expectedConfigId = deriveCredentialConfigurationId(exchange.variables.vc)
  if (req.credential_configuration_id !== expectedConfigId) {
    return err(
      400,
      'unknown_credential_configuration',
      `Credential configuration ${req.credential_configuration_id} is not offered by this exchange.`
    )
  }

  const vp = req.proofs.di_vp[0]
  const challenge = extractVpChallenge(vp as Record<string, unknown>)
  if (!challenge) {
    return err(
      400,
      'invalid_proof',
      'di_vp proof must include a challenge bound to a c_nonce.'
    )
  }

  const consumed = validateAndConsumeNonce(exchange, challenge)
  if (!consumed.ok) {
    return err(400, 'invalid_nonce', consumed.reason)
  }
  let working = consumed.value.exchange

  const debug = exchange.variables.debug ?? config.defaultExchangeDebug
  const didAuthResult = await verifyDIDAuth({
    presentation: vp as Record<string, unknown>,
    challenge,
    debug
  })
  if (!didAuthResult.verified) {
    return err(400, 'invalid_proof', 'DIDAuth verification failed.')
  }

  // Bind the credential to the entity that cryptographically signed the
  // di_vp proof — never the self-asserted top-level `holder` (which no
  // verifier layer checks). Reject when a present `holder` disagrees.
  const holderDid = didAuthResult.holder
  if (!holderDid) {
    return err(
      400,
      'invalid_proof',
      'Could not determine holder DID from the di_vp proof signer.'
    )
  }
  const assertedHolder = extractHolderDid(vp as Record<string, unknown>)
  if (assertedHolder && assertedHolder !== holderDid) {
    return err(
      400,
      'invalid_proof',
      'Presentation holder does not match the proof signer.'
    )
  }

  const walletCryptosuites = extractWalletCryptosuitesFromPresentation(
    vp as Record<string, unknown>
  )

  const signed = await signClaimCredentialFromHolderDid({
    holderDid,
    exchange: working,
    workflow,
    config,
    walletCryptosuites,
    compatLog: didAuthResult.compatLog
  })

  if (!signed) {
    return err(
      400,
      'credential_request_denied',
      'Workflow has no credential template configured.'
    )
  }

  // Re-read the working exchange to reflect the save inside the signing
  // helper (it persisted state='complete' + verifiableCredential).
  working = {
    ...working,
    state: 'complete',
    variables: {
      ...working.variables,
      results: {
        default: {
          verifiableCredential: [signed],
          ...(didAuthResult.compatLog
            ? { compatLog: didAuthResult.compatLog }
            : {})
        }
      }
    }
  }

  return {
    ok: true,
    exchange: working,
    response: { credentials: [{ credential: signed }] }
  }
}

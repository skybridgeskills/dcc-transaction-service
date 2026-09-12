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
import { journalExchangeEvent } from '../journal/index.js'

export type CredentialHandlerOk = {
  ok: true
  exchange: App.ExchangeDetailClaim
  response: CredentialResponse
}

export type CredentialHandlerErr = {
  ok: false
  status: 400 | 401
  body:
    | CredentialErrorResponse
    | { error: 'invalid_token'; error_description?: string }
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
 * The key-proof types a request offered, read off an unvalidated body.
 *
 * OID4VCI 1.0 §8.2 `proofs` is an object keyed by proof type; this service's
 * profile accepts `di_vp` and nothing else (`schemas.ts`, and
 * `proof_types_supported` advertises the same). So the keys of `proofs` are
 * what the wallet offered, whether or not we can honour any of them.
 *
 * Returns `[]` for a body with no `proofs` object at all. That is NOT by
 * itself the signature of an unreadable request: a pre-1.0-draft request is
 * also `proofs`-less, and reads identically here. See
 * {@link draftProofTypeOffered}, which the caller consults to tell those two
 * apart — the caller has to separate all three cases, and this reader answers
 * only for the 1.0-final one.
 */
const proofTypesOffered = (body: unknown): string[] => {
  if (!body || typeof body !== 'object') return []
  const proofs = (body as { proofs?: unknown }).proofs
  if (!proofs || typeof proofs !== 'object' || Array.isArray(proofs)) return []
  return Object.keys(proofs)
}

/**
 * The key-proof type a **draft-shaped** request offered, or `undefined`.
 *
 * OID4VCI drafts up to and including draft-13 carry a single `proof` object
 * with a `proof_type` discriminator; 1.0-final replaced it with the `proofs`
 * map that {@link proofTypesOffered} reads. A draft request therefore has no
 * `proofs` at all, and reading it with the 1.0-final reader alone gets `[]` —
 * indistinguishable from a body we could not parse.
 *
 * That indistinguishability is the same misattribution `proofTypesOffered`
 * exists to prevent, one spec version down, and it is not hypothetical:
 * draft-shaped requests are ordinary among shipping wallets, so a well-formed
 * draft-13 request would be journalled as `malformed-request` — our record
 * calling the wallet broken for conforming to the spec it implements.
 *
 * This does NOT make the service accept draft requests: the profile is
 * 1.0-final and the response is the same 400 either way. It makes the
 * *journal* say which of the three things happened.
 */
const draftProofTypeOffered = (body: unknown): string | undefined => {
  if (!body || typeof body !== 'object') return undefined
  const proof = (body as { proof?: unknown }).proof
  if (!proof || typeof proof !== 'object' || Array.isArray(proof))
    return undefined
  const proofType = (proof as { proof_type?: unknown }).proof_type
  return typeof proofType === 'string' ? proofType : undefined
}

/**
 * The challenge a Data Integrity VP commits to when used as an OID4VCI
 * key proof. We accept it on either the top-level `challenge` (some
 * libraries surface it there for VPRs) or — more canonically for a DI
 * VP — on `proof.challenge`.
 */
const extractVpChallenge = (
  vp: Record<string, unknown>
): string | undefined => {
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

  // Single-use: a completed exchange has already issued its credential.
  // Mirrors the VC-API guard in exchanges.ts. Checked after token validation
  // so completion state isn't leaked to unauthenticated callers.
  if (exchange.state === 'complete') {
    return err(
      400,
      'credential_request_denied',
      'A credential has already been issued for this exchange.'
    )
  }

  const parsed = credentialRequestSchema.safeParse(body)
  if (!parsed.success) {
    // Diagnostic only — the response is unchanged. What changes is that the
    // journal now says WHICH of three very different findings this was,
    // because on the wire they are the same 400 and the difference matters:
    //
    // - an **unsupported proof type** is a 1.0-conformant wallet asking in a
    //   proof type that is legal under the spec and out of this service's
    //   profile (`proofs: { jwt: [...] }`). That is a statement about our
    //   profile, and the wallet did nothing wrong;
    // - a **draft-shaped request** is a wallet conforming to a pre-1.0 draft:
    //   a single `proof` object instead of the `proofs` map. Also a statement
    //   about our profile, and also nothing the wallet did wrong;
    // - a **malformed request** is a request we could not read at all.
    //
    // Reading the first as the last cost a real investigation once already —
    // and reading the second as the last repeated it, because the 1.0-final
    // reader returns `[]` for a draft body
    // exactly as it does for an unreadable one. Draft shape is checked FIRST:
    // a draft `proof: { proof_type: 'di_vp' }` offers a type we do support, so
    // the type test alone would fall through and call it malformed.
    const proofTypes = proofTypesOffered(body)
    const draftProofType = draftProofTypeOffered(body)
    const offered =
      proofTypes.length > 0
        ? proofTypes
        : draftProofType
          ? [draftProofType]
          : []
    journalExchangeEvent(exchange, 'error', {
      stage: 'oid4vci-credential-request',
      reason:
        proofTypes.length === 0 && draftProofType !== undefined
          ? 'draft-shaped-request'
          : proofTypes.length > 0 && !proofTypes.includes('di_vp')
            ? 'unsupported-proof-type'
            : 'malformed-request',
      ...(offered.length > 0 ? { proofTypesOffered: offered } : {}),
      // The validator's own account of what was wrong, which is the part a
      // reader needs when the reason is `malformed-request`.
      issues: parsed.error.issues
    })
    return err(
      400,
      'invalid_credential_request',
      'Credential request body is malformed.'
    )
  }
  const req = parsed.data

  const expectedConfigId = deriveCredentialConfigurationId(
    exchange.variables.vc
  )
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

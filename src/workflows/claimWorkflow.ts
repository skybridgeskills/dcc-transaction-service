import { arrayOf } from '../utils.js'
// `@digitalbazaar/vc` is untyped; its declaration now lives in
// src/verification-modules.d.ts beside the other untyped DID and
// cryptosuite packages, so no local suppression is needed here.
import { createPresentation } from '@digitalbazaar/vc'
import Handlebars from 'handlebars'
import { vcApiExchangeCreateSchema, baseVariablesSchema } from '../schema.js'
import { verifyDIDAuth } from '../didAuth.js'
import { saveExchange } from '../transactionManager.js'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import {
  extractWalletCryptosuitesFromPresentation,
  selectIssuerInstance
} from '../lib/issuer-selection.js'
import { extractHolderDid } from '../lib/data/verifiable-presentation/extract-holder-did.js'
import { problemDetailResponse } from '../lib/errors/problem-details.js'
import { variablesFeaturesFromConfig } from '../lib/exchange-ui-features.js'
import { mintExchangeId } from '../lib/mint-exchange-id.js'
import { callUpstreamService } from '../lib/upstream-call.js'
import { journalExchangeEvent } from '../journal/index.js'

export const exchangeCreateSchemaClaim = vcApiExchangeCreateSchema.extend({
  variables: baseVariablesSchema.extend({
    subjectData: z.record(z.string(), z.any()).optional(),
    vc: z
      .string({
        message:
          'Incomplete exchange variables. Include a VC template as a string'
      })
      .refine(
        (vc) => {
          try {
            const data = JSON.parse(vc)

            // Rudimentary check to ensure VC template is valid
            const docType = arrayOf(data.type) as string[]
            return docType.includes('VerifiableCredential')
          } catch {
            return false
          }
        },
        { message: 'Invalid VC template. Must be a valid JSON string' }
      )
  })
})

export const validateExchangeClaim = (data: unknown) => {
  return exchangeCreateSchemaClaim.parse(data)
}

/**
 * Stamp a fresh `urn:uuid:` credential `id` onto the VC template, overwriting
 * whatever the caller supplied.
 *
 * **Why the service does this rather than trusting callers.** A credential id
 * is not the caller's to reuse: the status service allocates exactly one
 * revocation index per credential id and answers a second allocation with a
 * `409`. That refusal is correct — silently reallocating would make our own
 * status list untrue about the credential it describes — so the fix belongs
 * here, at the point where a *new* credential comes into being, and not
 * downstream of it.
 *
 * A fixed `id` in a template is otherwise invisible until the second issuance,
 * where it surfaces as a failure with no obvious connection to the template
 * that caused it. Two callers already stamp their own ids (the CLI profiles,
 * and LER via `retrievalId`); those keep working and stop being load-bearing,
 * and every other caller is now covered by the same rule.
 *
 * Non-JSON is returned unchanged: `exchangeCreateSchemaClaim` has already
 * rejected anything unparseable, so the guard is only here so that a future
 * caller reaching this function by another route fails at its own boundary
 * rather than at ours.
 */
const withFreshCredentialId = (vc: string): string => {
  try {
    const template = JSON.parse(vc) as Record<string, unknown>
    return JSON.stringify({ ...template, id: `urn:uuid:${crypto.randomUUID()}` })
  } catch {
    return vc
  }
}

export const createExchangeClaim = ({
  data,
  config
}: {
  data: z.infer<typeof exchangeCreateSchemaClaim>
  config: App.Config
}) => {
  const exchange: App.ExchangeDetailClaim = {
    ...data,
    workflowId: 'claim',
    exchangeId: mintExchangeId(data.exchangeIdPrefix),
    tenantName: data.variables.tenantName ?? config.defaultTenantName,
    variables: {
      ...data.variables,
      vc: withFreshCredentialId(data.variables.vc),
      challenge: crypto.randomUUID(),
      features: variablesFeaturesFromConfig(config)
    },
    expires:
      data.expires ??
      new Date(Date.now() + config.exchangeTtl * 1000).toISOString(),
    state: 'pending'
  }
  journalExchangeEvent(exchange, 'mint', {
    expires: exchange.expires,
    ...(data.exchangeIdPrefix
      ? { exchangeIdPrefix: data.exchangeIdPrefix }
      : {})
  })
  return exchange
}

export const participateInClaimExchange = async ({
  data,
  exchange,
  workflow,
  config
}: {
  data: Record<string, unknown>
  exchange: App.ExchangeDetailClaim
  workflow: App.Workflow
  config: App.Config
}) => {
  // This is the second step of the exchange, we will verify the DIDAuth and return the
  // previously stored data for the exchange.
  const debug = exchange.variables.debug ?? config.defaultExchangeDebug
  const didAuthResult = await verifyDIDAuth({
    presentation: data,
    challenge: exchange.variables.challenge,
    debug
  })

  if (!didAuthResult.verified) {
    throw new HTTPException(401, {
      message: 'Invalid DIDAuth or unsupported options.',
      cause: problemDetailResponse(
        'Invalid DIDAuth or unsupported options.',
        didAuthResult.problemDetails
      )
    })
  }

  // The wallet may POST a VC-API envelope (`{ verifiablePresentation: VP }`)
  // or a bare presentation; unwrap either shape before reading the holder DID.
  const presentation = ((data.verifiablePresentation ?? data) ??
    {}) as Record<string, unknown>
  // Bind to the entity that cryptographically signed the DIDAuth proof — never
  // the self-asserted top-level `holder`. Reject when a present `holder`
  // disagrees with the signer.
  const holderDid = didAuthResult.holder
  const assertedHolder = extractHolderDid(presentation)
  if (assertedHolder && holderDid && assertedHolder !== holderDid) {
    throw new HTTPException(401, {
      message: 'Presentation holder does not match the proof signer.'
    })
  }

  const signedCredential = await signClaimCredentialFromHolderDid({
    holderDid,
    exchange,
    workflow,
    config,
    walletCryptosuites: extractWalletCryptosuitesFromPresentation(data),
    compatLog: didAuthResult.compatLog
  })

  if (!signedCredential) {
    return {
      redirectUrl: exchange.variables.redirectUrl ?? ''
    }
  }

  // generate VP to return VCs
  const verifiablePresentation = createPresentation()
  verifiablePresentation.verifiableCredential = [signedCredential]

  // VC-API §"Participate in an exchange" returns the presentation wrapped:
  // `{ verifiablePresentation: VP }`. Earlier this returned a bare VP that also
  // carried a duplicated `verifiablePresentation` member — a hack so the Learner
  // Credential Wallet, which reads a bare VP, kept working.
  //
  // That hybrid breaks clients that parse the response strictly: the claim
  // flow runs to completion and we return 200 with a fully valid credential,
  // and the client still stores nothing, because the envelope is neither of
  // the two shapes it knows. Emitting the spec's shape is the fix.
  //
  // ⚠️ LCW compatibility: LCW reads a bare VP and will not find the credential in
  // this envelope. If LCW must keep working against this service, negotiate the
  // shape per client rather than reinstating the duplicated member.
  return { verifiablePresentation }
}

/**
 * Deliberately corrupt a freshly-signed credential, for negative test cases.
 *
 * Applied AFTER signing on purpose. Corrupting the template instead would
 * just produce a valid signature over bad content, which tests nothing — the
 * point is a credential whose proof and payload genuinely disagree.
 *
 * `proof` breaks the signature bytes; `claim` breaks a value the signature
 * covers and leaves the proof untouched. A wallet that only checks a proof is
 * present and well-formed passes the first and fails the second, which is why
 * both exist.
 *
 * `issuer` substitutes the issuer id AFTER signing, producing a credential that
 * names issuer Y while carrying a proof by X — the condition worth catching is
 * *accepts a credential from a spoofed source*. A wallet that verifies a proof
 * without asking whose key should have signed it passes `proof` and `claim` and
 * fails this one.
 *
 * ## Why the substituted id is the PROFILE's declaration
 *
 * The obvious way to stage this — *"alter the issuer in a credential offer so
 * it names an issuer that did not sign it"* — is not available here: the
 * signing service owns the issuer identity and `addIssuerId` derives it from
 * the tenant seed, overwriting whatever a profile declared (see the comment at
 * the signing call below). So the profile's declared `issuer.id` is
 * a value that is otherwise **discarded** — which makes it the natural carrier
 * for the substitution, and means a fixture needs no knob of its own: the two
 * spoofed-source arms are the same mode differing only in the DID they
 * declare.
 *
 * ⚠️ A no-op substitution THROWS rather than returning the credential
 * unchanged. A negative fixture that silently tests nothing is this service's
 * most-repeated defect class, and here it would silently run one arm twice.
 *
 * A service-side control, only ever aimed at our own issued credentials.
 */
export const applyTamper = <T>(
  signedCredential: T,
  mode: 'proof' | 'claim' | 'issuer' | undefined,
  declaredIssuerId?: string
): T => {
  if (!mode || !signedCredential || typeof signedCredential !== 'object') {
    return signedCredential
  }
  // Deep clone so the stored exchange record keeps the credential as delivered.
  const vc = JSON.parse(JSON.stringify(signedCredential)) as Record<
    string,
    unknown
  >

  if (mode === 'proof') {
    const proofs = Array.isArray(vc.proof) ? vc.proof : [vc.proof]
    for (const p of proofs) {
      const proof = p as Record<string, unknown> | undefined
      if (!proof || typeof proof.proofValue !== 'string') continue
      const v = proof.proofValue
      // Flip one character in the middle rather than truncating, so the value
      // stays the right length and multibase prefix — the failure has to be a
      // signature failure, not a parse failure.
      const i = Math.floor(v.length / 2)
      const swap = v[i] === 'a' ? 'b' : 'a'
      proof.proofValue = v.slice(0, i) + swap + v.slice(i + 1)
    }
    return vc as T
  }

  if (mode === 'issuer') {
    // Read the issued identity from whichever shape the signing service used.
    const issuer = vc.issuer
    const signedIssuerId =
      typeof issuer === 'string'
        ? issuer
        : ((issuer as Record<string, unknown> | undefined)?.id as
            | string
            | undefined)

    if (!declaredIssuerId) {
      throw new Error(
        'tamper: "issuer" needs an issuer id declared on the profile\'s `vc`; ' +
          'the profile declared none, so there is nothing to substitute.'
      )
    }
    if (declaredIssuerId === signedIssuerId) {
      throw new Error(
        `tamper: "issuer" would be a no-op — the profile declares the same ` +
          `issuer that signed the credential (${signedIssuerId}). Declare a ` +
          `DIFFERENT issuer, or this fixture tests nothing.`
      )
    }

    // Replace only the id, keeping `name`, `url` and `description` — that
    // metadata is what a wallet DISPLAYS, and the point of the fixture is a
    // credential that presents as issuer Y to a human reading the screen.
    if (typeof issuer === 'string') {
      vc.issuer = declaredIssuerId
    } else if (issuer && typeof issuer === 'object') {
      ;(issuer as Record<string, unknown>).id = declaredIssuerId
    } else {
      vc.issuer = declaredIssuerId
    }
    return vc as T
  }

  // mode === 'claim': mutate a signature-covered value, leaving the proof as-is.
  if (typeof vc.name === 'string') {
    vc.name = `${vc.name} [TAMPERED]`
  } else {
    const subject = vc.credentialSubject as Record<string, unknown> | undefined
    if (subject) subject.tamperedField = 'TAMPERED'
  }
  return vc as T
}

/**
 * Build, status-allocate, and sign a claim-workflow credential bound
 * to the given holder DID. Saves the exchange as `complete` with the
 * signed credential under `variables.results.default.verifiableCredential`.
 *
 * Shared between {@link participateInClaimExchange} (the VC-API
 * `vcapi` flow) and the OID4VCI credential endpoint, both of which
 * receive the holder DID via different proof shapes but converge on
 * the same signing path.
 *
 * Returns the signed credential, or `undefined` when the workflow has
 * no credential template configured (in which case the caller falls
 * back to a `redirectUrl` response).
 */
export const signClaimCredentialFromHolderDid = async ({
  holderDid,
  exchange,
  workflow,
  config,
  walletCryptosuites,
  compatLog
}: {
  holderDid: string | undefined
  exchange: App.ExchangeDetailClaim
  workflow: App.Workflow
  config: App.Config
  walletCryptosuites: string[]
  compatLog?: App.CheckResult[]
}): Promise<App.Credential | undefined> => {
  // Bind the credential to the authenticated holder. Fail loudly rather than
  // issuing a subject-less credential when the holder DID can't be determined.
  if (!holderDid) {
    throw new HTTPException(401, {
      message: 'Could not determine holder DID from the DIDAuth presentation.'
    })
  }

  const credentialTemplate = workflow?.credentialTemplates?.[0]
  if (!credentialTemplate) {
    // TODO: this path won't be hit for now, but we eventually should support redirection to a
    // url set in exchange variables at exchange creation time.
    return undefined
  }

  // The 'claim' workflow has a template that expects a `vc` variable of the built credential
  // as a string. Future more complex workflows may have more complex templates.
  let credential: App.Credential
  try {
    const builtCredential = await Handlebars.compile(credentialTemplate.template)(
      exchange.variables
    )
    credential = JSON.parse(builtCredential)
    credential.credentialSubject.id = holderDid
  } catch {
    throw new HTTPException(400, {
      message: 'Failed to build credential from template'
    })
  }

  const tenantKey = exchange.tenantName.toLowerCase()
  const tenant = config.tenants[tenantKey]
  const issuerInstance = tenant
    ? selectIssuerInstance(tenant, walletCryptosuites)
    : null
  const signingTenant =
    issuerInstance?.signingServiceTenant ?? exchange.tenantName

  // The issuer identity is the signing service's to set, and it already does:
  // `addIssuerId` derives it from the tenant seed (the authority) and —
  // critically — sets `.id` on an object issuer rather than replacing the
  // object. Writing a bare `issuerInstance.id` here cannot change the resulting
  // identity (`addIssuerId` overwrites it either way); it only forces the string
  // branch and destroys the issuer's `name`, `url` and `description`, which is
  // the metadata a wallet displays. `issuerInstance` is still load-bearing
  // above: it selects the instance and the signing tenant.

  // Both upstream calls go through `callUpstreamService`, which journals the
  // cause of a failure against this exchange and preserves an upstream refusal
  // that carried problem details. See `lib/upstream-call.ts` — the short
  // version is that the status service's `409 credential-already-allocated`
  // used to reach the caller as "An unexpected error occurred", and the 500 was
  // then read as a status-list bug it never was.
  //
  // add credential status if enabled
  if (config.statusService) {
    // The status service is Bearer-only on every write, so allocate carries a
    // token. Same URL and the same pre-signing point in the flow as before.
    credential = await callUpstreamService<App.Credential>({
      exchange,
      stage: 'status-allocate',
      endpoint: `${config.statusService}/credentials/status/allocate`,
      body: credential,
      ...(config.statusServiceToken
        ? {
            headers: {
              Authorization: `Bearer ${config.statusServiceToken}`
            }
          }
        : {})
    })
  }
  // The issuer id the PROFILE declared, read before signing overwrites it. It
  // is discarded on every normal path; `tamper: 'issuer'` is the one consumer.
  const declaredIssuer = (credential as unknown as Record<string, unknown>)
    .issuer
  const declaredIssuerId =
    typeof declaredIssuer === 'string'
      ? declaredIssuer
      : ((declaredIssuer as Record<string, unknown> | undefined)?.id as
          | string
          | undefined)

  const signedCredential = applyTamper(
    await callUpstreamService<App.Credential>({
      exchange,
      stage: 'credential-signing',
      endpoint: `${config.signingService}/instance/${signingTenant}/credentials/sign`,
      body: credential
    }),
    exchange.variables.tamper,
    declaredIssuerId
  )

  const updatedExchange: App.ExchangeDetailClaim = {
    ...exchange,
    state: 'complete',
    variables: {
      ...exchange.variables,
      results: {
        default: {
          verifiableCredential: [signedCredential],
          ...(compatLog ? { compatLog } : {})
        }
      }
    }
  }
  await saveExchange(updatedExchange)

  return signedCredential
}

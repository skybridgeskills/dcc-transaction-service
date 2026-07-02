import { arrayOf } from '../utils.js'
import { callService } from '../utils.js'
// @ts-expect-error createPresentation is untyped
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
import { problemDetailResponse } from '../lib/errors/problem-details.js'
import { variablesFeaturesFromConfig } from '../lib/exchange-ui-features.js'

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
    exchangeId: crypto.randomUUID(),
    tenantName: data.variables.tenantName ?? config.defaultTenantName,
    variables: {
      ...data.variables,
      challenge: crypto.randomUUID(),
      features: variablesFeaturesFromConfig(config)
    },
    expires:
      data.expires ??
      new Date(Date.now() + config.exchangeTtl * 1000).toISOString(),
    state: 'pending'
  }
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

  const signedCredential = await signClaimCredentialFromHolderDid({
    holderDid: data.holder as string,
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

  // VC-API indicates we would wrap this in a verifiablePresentation property, but LCW can't handle that.
  // Should be return {verifiablePresentation}
  // We will now try a stupid hack to nest it inside the VP
  verifiablePresentation['verifiablePresentation'] = {
    ...verifiablePresentation
  }

  return verifiablePresentation
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
  holderDid: string
  exchange: App.ExchangeDetailClaim
  workflow: App.Workflow
  config: App.Config
  walletCryptosuites: string[]
  compatLog?: App.CheckResult[]
}): Promise<App.Credential | undefined> => {
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

  if (issuerInstance?.id) {
    credential.issuer = issuerInstance.id
  }

  // add credential status if enabled
  if (config.statusService) {
    credential = await callService(
      `${config.statusService}/credentials/status/allocate`,
      credential
    )
  }
  const signedCredential = await callService(
    `${config.signingService}/instance/${signingTenant}/credentials/sign`,
    credential
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

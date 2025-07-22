import { documentLoader } from '../documentLoader.js'
import { preparePresentation } from '../verifiablePresentation.js'
import { saveExchange } from '../exchanges.js'
import { suites as verificationSuite } from '../suites.js'
import { vcApiExchangeCreateSchema, baseVariablesSchema } from '../schema.js'
// @ts-ignore // There are no type definitions for this library
import { verify } from '@digitalbazaar/vc'
import { z } from 'zod'
import {
  CONTEXT_URL_V1,
  CONTEXT_URL as CONTEXT_URL_V2
  // @ts-ignore
} from 'credentials-context'

export const exchangeCreateSchemaVerify = vcApiExchangeCreateSchema.extend({
  variables: baseVariablesSchema.extend({
    vprContext: z.array(z.string().url()),
    vprCredentialType: z.array(z.string()),
    trustedIssuers: z.array(z.string()).optional(),
    vprClaims: z.array(
      z
        .object({
          id: z.string().optional(),
          path: z.array(z.string()),
          values: z.array(z.string()).optional()
        })
        .optional()
    )
  })
})

export const validateExchangeVerify = (data: any) => {
  return exchangeCreateSchemaVerify.parse(data)
}

export const createExchangeVerify = ({
  data,
  config,
  workflow
}: {
  data: z.infer<typeof exchangeCreateSchemaVerify>
  config: App.Config
  workflow: App.Workflow
}) => {
  const exchange: App.ExchangeDetailVerify = {
    ...data,
    workflowId: 'verify',
    exchangeId: crypto.randomUUID(),
    tenantName: data.variables.tenantName,
    variables: {
      ...data.variables,
      challenge: crypto.randomUUID(),
      vprContext: data.variables.vprContext,
      vprCredentialType: data.variables.vprCredentialType,
      trustedIssuers: data.variables.trustedIssuers ?? [],
      vprClaims: data.variables.vprClaims?.filter((c) => c !== undefined) ?? []
    },
    expires:
      data.expires ??
      new Date(Date.now() + config.exchangeTtl * 1000).toISOString(),
    state: 'pending'
  }
  return exchange
}

const getCredentialQuery = ({
  vprContext,
  vprCredentialType,
  trustedIssuers,
  vprClaims
}: {
  vprContext: string[]
  vprCredentialType: string[]
  trustedIssuers: string[]
  vprClaims: App.DcqlClaim[]
}) => {
  const credentialQuery = {
    example: {
      '@context': vprContext,
      type: vprCredentialType
    }
  }
  // We don't yet support trusted issuers or specific claims yet
  // because the query by example spec is very underspecified
  return credentialQuery
}

export const getVerifyVPR = (exchange: App.ExchangeDetailVerify) => {
  const { vprContext, vprCredentialType, trustedIssuers, vprClaims } =
    exchange.variables
  const serviceEndpoint = `${exchange.variables.exchangeHost}/workflows/${exchange.workflowId}/exchanges/${exchange.exchangeId}`

  const specificContexts = vprContext.filter(
    (c) => ![CONTEXT_URL_V1, CONTEXT_URL_V2].includes(c)
  )

  // If no VC context is specified, we will generate a query for each major VC version.
  const credentialQuery = vprContext.some((c) =>
    [CONTEXT_URL_V1, CONTEXT_URL_V2].includes(c)
  )
    ? [
        getCredentialQuery({
          vprContext,
          vprCredentialType,
          trustedIssuers,
          vprClaims
        })
      ]
    : [
        // VCDM V1 credential query
        getCredentialQuery({
          vprContext: [CONTEXT_URL_V1, ...specificContexts],
          vprCredentialType,
          trustedIssuers,
          vprClaims
        }),
        // VCDM V2 credential query
        getCredentialQuery({
          vprContext: [CONTEXT_URL_V2, ...specificContexts],
          vprCredentialType,
          trustedIssuers,
          vprClaims
        })
      ]
  const vpr = {
    query: {
      type: 'QueryByExample',
      credentialQuery
    },
    interact: {
      service: [
        {
          type: 'VerifiableCredentialApiExchangeService',
          serviceEndpoint
        },
        {
          type: 'UnmediatedPresentationService2021',
          serviceEndpoint
        }
      ]
    }
  }
  return vpr
}

export const participateInVerifyExchange = async ({
  data,
  exchange,
  workflow,
  config
}: {
  data: any
  exchange: App.ExchangeDetailVerify
  workflow: App.Workflow
  config: App.Config
}) => {
  const presentation = preparePresentation(data)
  console.log(JSON.stringify(presentation, null, 2))
  const result = await verify({
    presentation,
    challenge: exchange.variables.challenge,
    suite: verificationSuite,
    documentLoader
  })
}

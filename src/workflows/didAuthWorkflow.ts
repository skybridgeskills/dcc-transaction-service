import { z } from 'zod'
import { vcApiExchangeCreateSchema, baseVariablesSchema } from '../schema.js'
import { HTTPException } from 'hono/http-exception'
import { verifyDIDAuth } from '../didAuth.js'

export const exchangeCreateSchemaDidAuth = vcApiExchangeCreateSchema.extend({})

export const validateExchangeDidAuth = (data: any) => {
  return exchangeCreateSchemaDidAuth.parse(data)
}

export const createExchangeDidAuth = ({
  data,
  config,
  workflow
}: {
  data: z.infer<typeof exchangeCreateSchemaDidAuth>
  config: App.Config
  workflow: App.Workflow
}) => {
  const exchange: App.ExchangeDetailBase = {
    ...data,
    workflowId: workflow.id,
    tenantName: data.variables.tenantName,
    exchangeId: crypto.randomUUID(),
    variables: {
      ...data.variables,
      challenge: crypto.randomUUID()
    },
    expires:
      data.expires ??
      new Date(Date.now() + config.exchangeTtl * 1000).toISOString(),
    state: 'pending'
  }
  return exchange
}

/**
 * This returns the authentication vpr as described in
 * https://w3c-ccg.github.io/vp-request-spec/#did-authentication
 */
export const getDIDAuthVPR = (exchange: App.ExchangeDetailBase) => {
  const serviceEndpoint = `${exchange.variables.exchangeHost}/workflows/${exchange.workflowId}/exchanges/${exchange.exchangeId}`

  return {
    query: {
      type: 'DIDAuthentication'
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
        },
        {
          type: 'CredentialHandlerService'
        }
      ]
    },
    challenge: exchange.variables.challenge,
    domain: exchange.variables.exchangeHost
  }
}

export const participateInDidAuthExchange = async ({
  data,
  exchange,
  workflow,
  config
}: {
  data: any
  exchange: App.ExchangeDetailDidAuth
  workflow: App.Workflow
  config: App.Config
}) => {
  // This is the second step of the exchange, we will verify the DIDAuth and return the
  // previously stored data for the exchange.
  const didAuthVerified = await verifyDIDAuth({
    presentation: data,
    challenge: exchange.variables.challenge
  })

  if (!didAuthVerified) {
    throw new HTTPException(401, {
      message: 'Invalid DIDAuth or unsupported options.'
    })
  }

  const credentialTemplate = workflow?.credentialTemplates?.[0]

  return {
    redirectUrl: exchange.variables.redirectUrl ?? ''
  }
}

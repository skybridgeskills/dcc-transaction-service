import { z } from 'zod'
import { vcApiExchangeCreateSchema, baseVariablesSchema } from '../schema.js'
import { HttpError } from '../lib/http-error.js'
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
 * Re-export getDIDAuthVPR from frontend-safe module
 * This returns the authentication vpr as described in
 * https://w3c-ccg.github.io/vp-request-spec/#did-authentication
 */
export { getDIDAuthVPR } from '../lib/protocols/vpr-generation.js'

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
    throw new HttpError(401, 'Invalid DIDAuth or unsupported options.')
  }

  const credentialTemplate = workflow?.credentialTemplates?.[0]

  return {
    redirectUrl: exchange.variables.redirectUrl ?? ''
  }
}

import { z } from 'zod'
import { vcApiExchangeCreateSchema } from '../schema.js'
import { HTTPException } from 'hono/http-exception'
import { verifyDIDAuth } from '../didAuth.js'
import { saveExchange } from '../transactionManager.js'
import { VERIFIABLE_CRYPTOSUITES } from '../lib/verifiable-cryptosuites.js'
import { problemDetailResponse } from '../lib/errors/problem-details.js'
import { variablesFeaturesFromConfig } from '../lib/exchange-ui-features.js'

export const exchangeCreateSchemaDidAuth = vcApiExchangeCreateSchema.extend({})

export const validateExchangeDidAuth = (data: unknown) => {
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
    tenantName: data.variables.tenantName ?? config.defaultTenantName,
    exchangeId: crypto.randomUUID(),
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
    domain: exchange.variables.exchangeHost,
    acceptedCryptosuites: [...VERIFIABLE_CRYPTOSUITES]
  }
}

export const participateInDidAuthExchange = async ({
  data,
  exchange,
  workflow: _workflow,
  config
}: {
  data: Record<string, unknown>
  exchange: App.ExchangeDetailDidAuth
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

  const updatedExchange: App.ExchangeDetailDidAuth = {
    ...exchange,
    state: 'complete',
    variables: {
      ...exchange.variables,
      results: {
        default: {
          holder: data.holder as string,
          ...(didAuthResult.compatLog
            ? { compatLog: didAuthResult.compatLog }
            : {})
        }
      }
    }
  }
  await saveExchange(updatedExchange)

  return {
    redirectUrl: exchange.variables.redirectUrl ?? ''
  }
}

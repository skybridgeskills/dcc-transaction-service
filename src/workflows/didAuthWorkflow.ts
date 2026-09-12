import { z } from 'zod'
import { vcApiExchangeCreateSchema } from '../schema.js'
import { HTTPException } from 'hono/http-exception'
import { verifyDIDAuth } from '../didAuth.js'
import { saveExchange } from '../transactionManager.js'
import { VERIFIABLE_CRYPTOSUITES } from '../lib/verifiable-cryptosuites.js'
import { problemDetailResponse } from '../lib/errors/problem-details.js'
import { variablesFeaturesFromConfig } from '../lib/exchange-ui-features.js'
import { mintExchangeId } from '../lib/mint-exchange-id.js'
import { journalExchangeEvent } from '../journal/index.js'
import { wireProfileForExchange } from '../protocol-profiles/for-exchange.js'
import {
  vprDomain,
  vprInteract,
  vprInteractServices
} from '../lib/vpr-wire.js'

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
    exchangeId: mintExchangeId(data.exchangeIdPrefix),
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
  journalExchangeEvent(exchange, 'mint', {
    expires: exchange.expires,
    ...(data.exchangeIdPrefix
      ? { exchangeIdPrefix: data.exchangeIdPrefix }
      : {})
  })
  return exchange
}

/**
 * This returns the authentication vpr as described in
 * https://w3c-ccg.github.io/vp-request-spec/#did-authentication
 */
export const getDIDAuthVPR = (exchange: App.ExchangeDetailBase) => {
  const serviceEndpoint = `${exchange.variables.exchangeHost}/workflows/${exchange.workflowId}/exchanges/${exchange.exchangeId}`

  // ⚠️ A BARE `DIDAuthentication` query — no `acceptedCryptosuites` and no
  // `acceptedMethods` on it, unlike the verify VPR. That difference is on the
  // wire today and is reproduced, not converged; a profile states it as
  // `emitDidAuthenticationAcceptedCryptosuites: false`.
  //
  // ⚠️ `domain` is the bare exchange host here and the full service endpoint in
  // the verify VPR. Also a live differential, also unexplained, also reproduced
  // rather than tidied — change it and a record written before the change and
  // one written after it are not comparable.
  const wire = wireProfileForExchange(exchange)

  return {
    query: {
      type: 'DIDAuthentication'
    },
    ...vprInteract(
      vprInteractServices(wire, serviceEndpoint, [
        'VerifiableCredentialApiExchangeService',
        'UnmediatedPresentationService2021',
        'CredentialHandlerService'
      ])
    ),
    challenge: exchange.variables.challenge,
    domain: vprDomain(
      wire,
      { exchangeHost: exchange.variables.exchangeHost, serviceEndpoint },
      'exchange-host'
    ),
    ...((wire?.vpr?.emitAcceptedCryptosuites ?? true)
      ? { acceptedCryptosuites: [...VERIFIABLE_CRYPTOSUITES] }
      : {})
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

  // Store the holder that actually signed the proof, not the self-asserted
  // top-level `holder`.
  if (!didAuthResult.holder) {
    throw new HTTPException(401, {
      message: 'Could not determine holder DID from the DIDAuth proof signer.'
    })
  }

  const updatedExchange: App.ExchangeDetailDidAuth = {
    ...exchange,
    state: 'complete',
    variables: {
      ...exchange.variables,
      results: {
        default: {
          holder: didAuthResult.holder,
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

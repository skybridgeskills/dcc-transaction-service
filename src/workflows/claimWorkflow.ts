import { arrayOf } from '../utils.js'
import { callService } from '../utils.js'
// @ts-expect-error createPresentation is untyped
import { createPresentation } from '@digitalbazaar/vc'
import Handlebars from 'handlebars'
import { vcApiExchangeCreateSchema, baseVariablesSchema } from '../schema.js'
import { verifyDIDAuth } from '../didAuth.js'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'

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
          } catch (error) {
            return false
          }
        },
        { message: 'Invalid VC template. Must be a valid JSON string' }
      )
  })
})

export const validateExchangeClaim = (data: any) => {
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
    tenantName: data.variables.tenantName,
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

export const participateInClaimExchange = async ({
  data,
  exchange,
  workflow,
  config
}: {
  data: any
  exchange: App.ExchangeDetailClaim
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
  if (!credentialTemplate) {
    // TODO: this path won't be hit for now, but we eventually should support redirection to a
    // url set in exchange variables at exchange creation time.
    return {
      redirectUrl: exchange.variables.redirectUrl ?? ''
    }
  }

  // The 'claim' workflow has a template that expects a `vc` variable of the built credential
  // as a string. Future more complex workflows may have more complex templates.
  let credential: App.Credential
  try {
    const builtCredential = await Handlebars.compile(
      credentialTemplate.template
    )(exchange.variables)
    credential = JSON.parse(builtCredential)
    credential.credentialSubject.id = data.holder
  } catch (error) {
    throw new HTTPException(400, {
      message: 'Failed to build credential from template'
    })
  }

  // add credential status if enabled
  if (config.statusService) {
    credential = await callService(
      `${config.statusService}/credentials/status/allocate`,
      credential
    )
  }
  const signedCredential = await callService(
    `${config.signingService}/instance/${exchange.tenantName}/credentials/sign`,
    credential
  )
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

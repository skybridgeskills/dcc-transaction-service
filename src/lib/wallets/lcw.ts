import type { InteractionUrlOptions, Wallet } from './wallet-schema.js'

export const lcw: Wallet = {
  id: 'lcw',
  name: 'Learner Credential Wallet',
  description: 'A wallet for managing learner credentials',
  protocols: {
    vcapi: {
      getInteractionUrl(serviceEndpoint: string, options?: InteractionUrlOptions) {
        const issuer = new URL(serviceEndpoint).hostname
        const vcRequestUrl = encodeURIComponent(serviceEndpoint)
        const challenge = options?.challenge
          ? `&challenge=${options.challenge}`
          : ''
        return `https://lcw.app/request.html?issuer=${issuer}&auth_type=bearer${challenge}&vc_request_url=${vcRequestUrl}`
      }
    },
    vcapiExchange: {
      getInteractionUrl(serviceEndpoint: string) {
        const request = encodeURIComponent(
          JSON.stringify({ protocols: { vcapi: serviceEndpoint } })
        )
        return `https://lcw.app/request?request=${request}`
      }
    }
  }
}

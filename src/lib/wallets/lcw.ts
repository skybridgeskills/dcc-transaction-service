import type { Wallet } from './wallet-schema.js'

export const lcw: Wallet = {
  id: 'lcw',
  name: 'Learner Credential Wallet',
  description: 'A wallet for managing learner credentials',
  protocols: {
    vcapi: {
      getInteractionUrl(serviceEndpoint: string) {
        const origin = new URL(serviceEndpoint).origin
        return `https://lcw.app/request?request=${encodeURIComponent(
          JSON.stringify({
            credentialRequestOrigin: origin,
            protocols: { vcapi: serviceEndpoint }
          })
        )}`
      }
    }
  }
}

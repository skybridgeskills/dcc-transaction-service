import type { Wallet } from './wallet-schema.js'

export const learnCard: Wallet = {
  id: 'learncard',
  name: 'LearnCard',
  protocols: {
    vcapi: {
      getInteractionUrl(serviceEndpoint: string) {
        return `https://learncard.app/request?vc_request_url=${encodeURIComponent(serviceEndpoint)}`
      }
    }
  }
}

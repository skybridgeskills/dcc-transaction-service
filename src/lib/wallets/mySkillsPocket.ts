import type { Wallet } from './wallet-schema.js'

export const mySkillsPocket: Wallet = {
  id: 'my-skills-pocket',
  name: 'My Skills Pocket',
  description:
    'Collect, track, view, verify, and even share your accomplishments, awards, and more with My Skills Pocket by Arizona State University! Available to the general public.',
  protocols: {
    vcapi: {
      getInteractionUrl(serviceEndpoint: string) {
        const origin = new URL(serviceEndpoint).origin
        return `msprequest://request?request=${encodeURIComponent(
          JSON.stringify({
            credentialRequestOrigin: origin,
            protocols: { vcapi: serviceEndpoint }
          })
        )}`
      }
    }
  }
}

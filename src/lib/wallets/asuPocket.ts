import type { Wallet } from './wallet-schema.js'

export const asuPocket: Wallet = {
  id: 'asu-pocket',
  name: 'ASU Pocket',
  description:
    'ASU Pocket is a digital wallet for storing and managing achievements in work and learning. Currently serving Arizona State University, ASU Pocket allows students, staff, and faculty to access badges and digital records of their achievements from across the university, including records for employment, education, training, memberships, and other activities.',
  protocols: {
    vcapi: {
      getInteractionUrl(serviceEndpoint: string) {
        const origin = new URL(serviceEndpoint).origin
        return `asuprequest://request?request=${encodeURIComponent(
          JSON.stringify({
            credentialRequestOrigin: origin,
            protocols: { vcapi: serviceEndpoint }
          })
        )}`
      }
    }
  }
}

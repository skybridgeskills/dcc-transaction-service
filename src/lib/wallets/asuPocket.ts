import type { Wallet } from './wallet-schema.js'

export const asuPocket: Wallet = {
  id: 'asu-pocket',
  name: 'ASU Pocket',
  aliases: ['ASU Pocket', 'Pocket'],
  description:
    'ASU Pocket is a digital wallet for storing and managing achievements in work and learning. Currently serving Arizona State University, ASU Pocket allows students, staff, and faculty to access badges and digital records of their achievements from across the university, including records for employment, education, training, memberships, and other activities.',
  links: [
    { construction: 'vc-request-url-query', base: 'asuprequest://request' }
  ]
}

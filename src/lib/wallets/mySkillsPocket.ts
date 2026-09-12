import type { Wallet } from './wallet-schema.js'

export const mySkillsPocket: Wallet = {
  id: 'my-skills-pocket',
  name: 'My Skills Pocket',
  aliases: ['My Skills Pocket', 'MSP'],
  description:
    'Collect, track, view, verify, and even share your accomplishments, awards, and more with My Skills Pocket by Arizona State University! Available to the general public.',
  links: [
    { construction: 'vc-request-url-query', base: 'msprequest://request' }
  ]
}

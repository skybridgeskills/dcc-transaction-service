import type { Wallet } from './wallet-schema.js'

export const learnCard: Wallet = {
  id: 'learncard',
  name: 'LearnCard',
  aliases: ['LearnCard', 'Learn Card'],
  links: [
    {
      construction: 'vc-request-url-query',
      base: 'https://learncard.app/request'
    }
  ]
}

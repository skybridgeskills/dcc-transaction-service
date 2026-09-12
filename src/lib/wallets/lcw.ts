import type { Wallet } from './wallet-schema.js'

/**
 * ⚠️ The only product whose link this SERVICE emits, under the grandfathered
 * `lcw` protocols key. Every other entry's link is built by the interaction
 * page when a user picks it.
 *
 * ⚠️ It accepts two shapes and the workflow decides which — verify exchanges
 * get the JSON-protocols form, everything else the issuer/auth/challenge form.
 * That choice is a protocol profile field, not a property of the product.
 */
export const lcw: Wallet = {
  id: 'lcw',
  name: 'Learner Credential Wallet',
  aliases: ['LCW', 'Learner Credential Wallet'],
  description: 'A wallet for managing learner credentials',
  links: [
    // ⚠️ Two shapes, two PATHS. `/request` and `/request.html` are not the same
    // endpoint, and both are cited by recorded runs.
    { construction: 'protocols-json-query', base: 'https://lcw.app/request' },
    {
      construction: 'issuer-auth-challenge-query',
      base: 'https://lcw.app/request.html'
    }
  ]
}

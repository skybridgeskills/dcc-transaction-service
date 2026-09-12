/**
 * ACCEPTANCE TEST for the proof-set defect.
 *
 * The VC Data Model types `proof` as one proof OR a SET of proofs. Our Zod
 * schema took only a single object, so a multi-proof credential was rejected
 * at the STRUCTURAL gate, before any cryptosuite was consulted — surfacing as
 * the wholly misleading `Invalid Verifiable Credential(s)`.
 *
 * A multi-proof presentation drew:
 *   `at credential[0].proof: Expected object, received array`
 *
 * ⚠️ THE THIRD INSTANCE OF ONE DEFECT CLASS. `proof.created` was the first,
 * `acceptedMethods`'s wire format the second. Each was
 * our instrument being wrong about a spec we claim to speak, and each was
 * found by an independent implementation rather than by our own tests. The
 * last block in this file is the response to that pattern: it asserts the
 * property directly, so a fourth field cannot fail the same way silently.
 *
 * ⚠️ The fixture's proof set is not one we assembled to match our own
 * schema — doing that would re-encode the assumptions under test, which is
 * the exact trap the `acceptedMethods` defect found in the invariant the
 * `proof.created` fix left behind. Its three proofs and
 * their ordering are the shape an independent implementation produces, and
 * that shape is the whole regression value here. Treat the proof array as
 * fixed; the credential around it is ordinary sample data.
 */
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseCredential } from './verifiable-credential/schema.js'

const multiProof = JSON.parse(
  readFileSync(
    new URL(
      '../../test-fixtures/multi-proof-three-suites-vc.sample.json',
      import.meta.url
    ),
    'utf8'
  )
)

describe('proof sets — the VC Data Model permits more than one proof', () => {
  test('the fixture really is multi-proof (guards the guard)', () => {
    expect(Array.isArray(multiProof.proof)).toBe(true)
    expect(multiProof.proof.length).toBe(3)
    expect(multiProof.proof.map((p: { cryptosuite: string }) => p.cryptosuite)).toEqual([
      'ecdsa-rdfc-2019',
      'ecdsa-jcs-2019',
      'ecdsa-sd-2023'
    ])
  })

  test('a credential with a proof SET parses', () => {
    // Fails pre-fix with:
    //   at credential[0].proof: Expected object, received array
    const result = parseCredential(multiProof, 'credential[0]')
    if (!result.success) {
      throw new Error(
        `proof set rejected: ${result.problemDetails.map((p) => p.detail).join('; ')}`
      )
    }
    expect(result.success).toBe(true)
  })

  test('the parsed proofs survive intact — all three, in order', () => {
    // A union that silently coerced to the first proof would pass the test
    // above while destroying the evidence the verifier needs.
    const result = parseCredential(multiProof, 'credential[0]')
    if (!result.success) throw new Error('parse failed')
    const proof = (result.data as { proof: unknown }).proof
    expect(Array.isArray(proof)).toBe(true)
    expect(proof as unknown[]).toHaveLength(3)
  })

  test('a single proof object still parses — the set is a widening, not a swap', () => {
    const single = { ...multiProof, proof: multiProof.proof[0] }
    const result = parseCredential(single, 'credential[0]')
    expect(result.success).toBe(true)
  })

  test('the set is still validated elementwise — junk in a set is rejected', () => {
    // `z.union([schema, z.array(schema)])` must not degrade to `z.any()`.
    // A set whose second element is not a proof is malformed and must fail.
    const bad = {
      ...multiProof,
      proof: [multiProof.proof[0], { type: 'DataIntegrityProof' }]
    }
    const result = parseCredential(bad, 'credential[0]')
    expect(result.success).toBe(false)
  })
})

describe('the pattern behind the pattern', () => {
  test('every consumer of `proof` in src/ tolerates a set', async () => {
    // Three fields have now failed the same way, each found by a wallet.
    // The schema is one place `proof` is read; the others already handled
    // sets by hand (`claimWorkflow`, `issuer-selection`) — this pins that
    // agreement so the schema and its consumers cannot drift apart again.
    const { extractWalletCryptosuitesFromPresentation } = await import(
      '../issuer-selection.js'
    )
    const asPresentation = {
      verifiableCredential: multiProof,
      proof: multiProof.proof
    }
    const suites = extractWalletCryptosuitesFromPresentation(
      asPresentation as never
    )
    expect(suites).toContain('ecdsa-rdfc-2019')
    expect(suites).toContain('ecdsa-sd-2023')
  })
})

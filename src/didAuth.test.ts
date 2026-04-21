import { describe, expect, test } from 'vitest'
import { HTTPException } from 'hono/http-exception'
import { getSignedDIDAuth, verifyDIDAuth } from './didAuth.js'

describe('verifyDIDAuth', function () {
  test('verifies a bare signed DID Auth presentation (debug=false omits compatLog)', async function () {
    const challenge = crypto.randomUUID()
    const presentation = await getSignedDIDAuth(challenge)

    const result = await verifyDIDAuth({ presentation, challenge })

    expect(result.verified).toBe(true)
    expect((result as { compatLog?: unknown }).compatLog).toBeUndefined()
  })

  test('returns compatLog including wrap-bare-presentation entry when debug=true', async function () {
    const challenge = crypto.randomUUID()
    const presentation = await getSignedDIDAuth(challenge)

    const result = await verifyDIDAuth({
      presentation,
      challenge,
      debug: true
    })

    expect(result.verified).toBe(true)
    expect(result.compatLog).toBeDefined()
    const entries = result.compatLog ?? []
    // Every compatLog entry has a `compat.*` id by construction.
    for (const c of entries) {
      expect(c.id?.startsWith('compat.')).toBe(true)
    }
    expect(
      entries.some(
        (c) => c.id === 'compat.vcalm-participation-message.wrap-bare-presentation'
      )
    ).toBe(true)
  })

  test('returns problemDetails (and no compatLog) for an invalid challenge with debug=false', async function () {
    const presentation = await getSignedDIDAuth('issued-challenge')

    const result = await verifyDIDAuth({
      presentation,
      challenge: 'wrong-challenge'
    })

    expect(result.verified).toBe(false)
    if (result.verified) throw new Error('unreachable')
    expect(result.problemDetails.length).toBeGreaterThan(0)
    expect(result.compatLog).toBeUndefined()
  })

  test('returns problemDetails AND compatLog for an invalid challenge with debug=true', async function () {
    const presentation = await getSignedDIDAuth('issued-challenge')

    const result = await verifyDIDAuth({
      presentation,
      challenge: 'wrong-challenge',
      debug: true
    })

    expect(result.verified).toBe(false)
    if (result.verified) throw new Error('unreachable')
    expect(result.problemDetails.length).toBeGreaterThan(0)
    expect(result.compatLog).toBeDefined()
    expect(
      (result.compatLog ?? []).every((c) =>
        Boolean(c.id?.startsWith('compat.'))
      )
    ).toBe(true)
  })

  test('throws HTTPException(400) when the body is not a valid VP structure', async function () {
    await expect(
      verifyDIDAuth({
        presentation: { not: 'a presentation' },
        challenge: 'whatever'
      })
    ).rejects.toBeInstanceOf(HTTPException)

    try {
      await verifyDIDAuth({
        presentation: { not: 'a presentation' },
        challenge: 'whatever'
      })
    } catch (e) {
      expect(e).toBeInstanceOf(HTTPException)
      expect((e as HTTPException).status).toBe(400)
    }
  })

  test('throws HTTPException(400) when type is not VerifiablePresentation', async function () {
    const challenge = crypto.randomUUID()
    const presentation = await getSignedDIDAuth(challenge)
    const malformed = { ...presentation, type: 'NotAPresentation' }

    await expect(
      verifyDIDAuth({ presentation: malformed, challenge })
    ).rejects.toMatchObject({ status: 400 })
  })

  test('does not mutate the input presentation', async function () {
    const challenge = crypto.randomUUID()
    const presentation = await getSignedDIDAuth(challenge)
    const before = JSON.parse(JSON.stringify(presentation))

    await verifyDIDAuth({ presentation, challenge, debug: true })

    expect(presentation).toEqual(before)
  })
})

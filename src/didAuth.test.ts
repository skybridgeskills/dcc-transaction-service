import { describe, expect, test } from 'vitest'
import { HTTPException } from 'hono/http-exception'
import { getSignedDIDAuth, verifyDIDAuth } from './didAuth.js'

describe('verifyDIDAuth', function () {
  test('verifies a bare signed DID Auth presentation (debug=false omits allResults)', async function () {
    const challenge = crypto.randomUUID()
    const presentation = await getSignedDIDAuth(challenge)

    const result = await verifyDIDAuth({ presentation, challenge })

    expect(result.verified).toBe(true)
    // debug defaults to false → no allResults exposed
    expect((result as { allResults?: unknown }).allResults).toBeUndefined()
  })

  test('returns allResults including wrap-bare-presentation compat entry when debug=true', async function () {
    const challenge = crypto.randomUUID()
    const presentation = await getSignedDIDAuth(challenge)

    const result = await verifyDIDAuth({
      presentation,
      challenge,
      debug: true
    })

    expect(result.verified).toBe(true)
    expect(result.allResults).toBeDefined()
    const checks = result.allResults ?? []
    const compatChecks = checks.filter((c) =>
      c.check.startsWith('compatibility.')
    )
    expect(
      compatChecks.some(
        (c) =>
          c.check ===
          'compatibility.vcalm-participation-message:wrap-bare-presentation'
      )
    ).toBe(true)
    // verifier-core checks should still be present after the prepended compat entries
    expect(checks.length).toBeGreaterThan(compatChecks.length)
  })

  test('returns problemDetails (and no allResults) for an invalid challenge with debug=false', async function () {
    const presentation = await getSignedDIDAuth('issued-challenge')

    const result = await verifyDIDAuth({
      presentation,
      challenge: 'wrong-challenge'
    })

    expect(result.verified).toBe(false)
    if (result.verified) throw new Error('unreachable')
    expect(result.problemDetails.length).toBeGreaterThan(0)
    expect(result.allResults).toBeUndefined()
  })

  test('returns problemDetails AND allResults for an invalid challenge with debug=true', async function () {
    const presentation = await getSignedDIDAuth('issued-challenge')

    const result = await verifyDIDAuth({
      presentation,
      challenge: 'wrong-challenge',
      debug: true
    })

    expect(result.verified).toBe(false)
    if (result.verified) throw new Error('unreachable')
    expect(result.problemDetails.length).toBeGreaterThan(0)
    expect(result.allResults).toBeDefined()
    expect(
      (result.allResults ?? []).some((c) => c.check.startsWith('compatibility.'))
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

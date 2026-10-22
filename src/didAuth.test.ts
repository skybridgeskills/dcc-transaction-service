import { describe, expect, test } from 'vitest'
import { HTTPException } from 'hono/http-exception'
import { getSignedDIDAuth, verifyDIDAuth } from './didAuth.js'

/** The `domain` these presentations are requested under and signed with. */
const DOMAIN = 'https://exchange.example'

describe('verifyDIDAuth', function () {
  test('verifies a bare signed DID Auth presentation (debug=false omits compatLog)', async function () {
    const challenge = crypto.randomUUID()
    const presentation = await getSignedDIDAuth(challenge, undefined, DOMAIN)

    const result = await verifyDIDAuth({ presentation, challenge, domain: DOMAIN })

    expect(result.verified).toBe(true)
    expect((result as { compatLog?: unknown }).compatLog).toBeUndefined()
  })

  test('returns compatLog including wrap-bare-presentation entry when debug=true', async function () {
    const challenge = crypto.randomUUID()
    const presentation = await getSignedDIDAuth(challenge, undefined, DOMAIN)

    const result = await verifyDIDAuth({
      presentation,
      challenge,
      domain: DOMAIN,
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
    const presentation = await getSignedDIDAuth('issued-challenge', undefined, DOMAIN)

    const result = await verifyDIDAuth({
      presentation,
      challenge: 'wrong-challenge',
      domain: DOMAIN
    })

    expect(result.verified).toBe(false)
    if (result.verified) throw new Error('unreachable')
    expect(result.problemDetails.length).toBeGreaterThan(0)
    expect(result.compatLog).toBeUndefined()
  })

  test('returns problemDetails AND compatLog for an invalid challenge with debug=true', async function () {
    const presentation = await getSignedDIDAuth('issued-challenge', undefined, DOMAIN)

    const result = await verifyDIDAuth({
      presentation,
      challenge: 'wrong-challenge',
      domain: DOMAIN,
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
        challenge: 'whatever',
        domain: DOMAIN
      })
    ).rejects.toBeInstanceOf(HTTPException)

    try {
      await verifyDIDAuth({
        presentation: { not: 'a presentation' },
        challenge: 'whatever',
        domain: DOMAIN
      })
    } catch (e) {
      expect(e).toBeInstanceOf(HTTPException)
      expect((e as HTTPException).status).toBe(400)
    }
  })

  test('throws HTTPException(400) when type is not VerifiablePresentation', async function () {
    const challenge = crypto.randomUUID()
    const presentation = await getSignedDIDAuth(challenge, undefined, DOMAIN)
    const malformed = { ...presentation, type: 'NotAPresentation' }

    await expect(
      verifyDIDAuth({ presentation: malformed, challenge, domain: DOMAIN })
    ).rejects.toMatchObject({ status: 400 })
  })

  test('does not mutate the input presentation', async function () {
    const challenge = crypto.randomUUID()
    const presentation = await getSignedDIDAuth(challenge, undefined, DOMAIN)
    const before = JSON.parse(JSON.stringify(presentation))

    await verifyDIDAuth({ presentation, challenge, domain: DOMAIN, debug: true })

    expect(presentation).toEqual(before)
  })

  // The DID that controls the test signing key (see `initializeKeyAndSuite`).
  const SIGNER = 'did:key:z6MkvL5yVCgPhYvQwSoSRQou6k6ZGfD5mNM57HKxufEXwfnP'

  test('returns the holder derived from the proof signer', async function () {
    const challenge = crypto.randomUUID()
    const presentation = await getSignedDIDAuth(challenge, undefined, DOMAIN)

    const result = await verifyDIDAuth({ presentation, challenge, domain: DOMAIN })

    expect(result.verified).toBe(true)
    if (!result.verified) throw new Error('unreachable')
    expect(result.holder).toBe(SIGNER)
  })

  test('returns the signer as holder even when the VP self-asserts a different holder', async function () {
    // Sign with the test key but claim a `holder` DID the signer does not
    // control. The returned holder MUST be the signer, not the spoofed value —
    // this is the load-bearing binding that stops issuing to an unowned DID.
    const challenge = crypto.randomUUID()
    const presentation = await getSignedDIDAuth(challenge, 'did:example:victim', DOMAIN)

    const result = await verifyDIDAuth({ presentation, challenge, domain: DOMAIN })

    expect(result.verified).toBe(true)
    if (!result.verified) throw new Error('unreachable')
    expect(presentation.holder).toBe('did:example:victim')
    expect(result.holder).toBe(SIGNER)
  })

  describe('domain', function () {
    test('a proof without a domain is refused, and the problem names the domain', async function () {
      const challenge = crypto.randomUUID()
      const presentation = await getSignedDIDAuth(challenge)

      const result = await verifyDIDAuth({ presentation, challenge, domain: DOMAIN })

      expect(result.verified).toBe(false)
      if (result.verified) throw new Error('unreachable')
      expect(JSON.stringify(result.problemDetails)).toMatch(/domain/i)
    })

    test('a proof with another domain is refused', async function () {
      const challenge = crypto.randomUUID()
      const presentation = await getSignedDIDAuth(
        challenge,
        undefined,
        'https://elsewhere.example'
      )

      const result = await verifyDIDAuth({ presentation, challenge, domain: DOMAIN })

      expect(result.verified).toBe(false)
    })

    describe('absentAccepted (the claim bare-VP doorway)', function () {
      const doorway = { absentAccepted: true as const, expected: DOMAIN }

      test('a proof with no domain is accepted, and says so', async function () {
        const challenge = crypto.randomUUID()
        const presentation = await getSignedDIDAuth(challenge)

        const result = await verifyDIDAuth({ presentation, challenge, domain: doorway })

        expect(result.verified).toBe(true)
        if (!result.verified) throw new Error('unreachable')
        expect(result.domainAbsentAccepted).toBe(true)
      })

      test('the challenge is still enforced', async function () {
        const presentation = await getSignedDIDAuth('issued-challenge')

        const result = await verifyDIDAuth({
          presentation,
          challenge: 'wrong-challenge',
          domain: doorway
        })

        expect(result.verified).toBe(false)
      })

      test('a proof with a wrong domain is still refused', async function () {
        const challenge = crypto.randomUUID()
        const presentation = await getSignedDIDAuth(
          challenge,
          undefined,
          'https://elsewhere.example'
        )

        const result = await verifyDIDAuth({ presentation, challenge, domain: doorway })

        expect(result.verified).toBe(false)
      })

      test('a proof with the right domain is accepted, with no exception recorded', async function () {
        const challenge = crypto.randomUUID()
        const presentation = await getSignedDIDAuth(challenge, undefined, DOMAIN)

        const result = await verifyDIDAuth({ presentation, challenge, domain: doorway })

        expect(result.verified).toBe(true)
        if (!result.verified) throw new Error('unreachable')
        expect(result.domainAbsentAccepted).toBeUndefined()
      })
    })
  })
})

/**
 * The byte-for-byte gate on the protocol profile migration.
 *
 * ⚠️ **Every fixture in `src/test-fixtures/protocol-goldens/` was captured from
 * source that had no profile wiring in it.** They are what this service put on
 * the wire before any of this existed. Two runs are asserted against them:
 *
 * 1. **No profile configured** — every deployment today. Proves the migration
 *    moved nothing for callers who have not adopted it.
 * 2. **Profile-driven, with every knob stripped** — proves the profile surface
 *    can carry the service rather than merely sit beside it. This is the half
 *    that would pass vacuously if the knobs were left in, which is why
 *    `withoutKnobs` removes them.
 *
 * ⚠️ **A failure here means the bytes moved.** It does not mean a fixture is
 * stale. There is deliberately no way to regenerate one from inside the repo:
 * the diff IS the finding.
 */
import { describe, expect, test, beforeAll, afterAll, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import axios from 'axios'
import * as config from '../config.js'
import {
  GOLDEN_CASES,
  captureGolden,
  withoutKnobs,
  type GoldenCapture,
  type GoldenCase
} from '../test-fixtures/protocol-profile-goldens.js'
import {
  DOUBLE_TENANT_NAME,
  doubleSignRequestObject,
  doubleTenant
} from '../test-fixtures/signing-service-double.js'

/** Fixed, so no golden carries a developer's own signing-service address. */
const GOLDEN_SIGNING_SERVICE = 'http://signing.test:4006'

/** Read by the `getConfig` spy, so a case can switch the app default per run. */
let activeProfileName: string | undefined

beforeAll(() => {
  // ⚠️ The signing service is a DOUBLE and signs nothing. It is here because
  // the conformant arm's envelope cannot be captured without an upstream
  // answering, and the third segment it returns is a digest of the signing
  // input — so a re-serialization on our side still moves the bytes and still
  // fails. Read `test-fixtures/signing-service-double.ts` before treating any
  // captured signature as cryptographic evidence.
  vi.spyOn(axios, 'post').mockImplementation(
    (url: string, body?: unknown): Promise<{ data: unknown }> =>
      url.includes('/openid4vp/request-object/sign')
        ? Promise.resolve({ data: doubleSignRequestObject(body) })
        : Promise.resolve({ data: {} })
  )
  const cur = config.getConfig()
  vi.spyOn(config, 'getConfig').mockImplementation(() => ({
    ...cur,
    statusService: '',
    signingService: GOLDEN_SIGNING_SERVICE,
    tenantAuthenticationEnabled: false,
    // The fixture tenant with an entity identity, so the signed arm has a
    // `client_id` to build. Injected rather than read from `.env`: a golden
    // whose bytes depend on whose machine ran it is not a golden.
    tenants: { ...cur.tenants, [DOUBLE_TENANT_NAME]: doubleTenant() },
    ...(activeProfileName
      ? { defaultProtocolProfileName: activeProfileName }
      : {})
  }))
})

afterAll(() => {
  activeProfileName = undefined
  vi.restoreAllMocks()
})

const goldenFor = async (name: string): Promise<GoldenCapture> =>
  JSON.parse(
    await readFile(`src/test-fixtures/protocol-goldens/${name}.json`, 'utf8')
  ) as GoldenCapture

/**
 * The served bytes, and only those.
 *
 * The case's own `variables` are excluded on purpose: the profile-driven run
 * posts fewer of them by design, and comparing them would fail for the one
 * reason that is not a defect.
 */
const wireOf = (capture: GoldenCapture) => ({
  protocols: capture.protocols,
  oid4vpRequest: capture.oid4vpRequest,
  credentialOffer: capture.credentialOffer
})

describe('goldens · no profile configured — the migration moved nothing', () => {
  // ⚠️ Profile-only constructions are excluded, and only those. With no profile
  // configured the service emits a different construction entirely, so
  // asserting the fixture here would assert that two different constructions
  // are the same.
  test.each(
    GOLDEN_CASES.filter((c) => !c.profileOnly).map(
      (c): [string, GoldenCase] => [c.name, c]
    )
  )(
    '%s emits exactly the bytes captured before any profile existed',
    async (name, testCase) => {
      activeProfileName = undefined
      expect(wireOf(await captureGolden(testCase))).toEqual(
        wireOf(await goldenFor(name))
      )
    }
  )
})

describe('goldens · profile-driven, every knob stripped', () => {
  test.each(GOLDEN_CASES.map((c): [string, GoldenCase] => [c.name, c]))(
    '%s is reproduced by its profile alone',
    async (name, testCase) => {
      activeProfileName = testCase.profile
      try {
        expect(wireOf(await captureGolden(withoutKnobs(testCase)))).toEqual(
          wireOf(await goldenFor(name))
        )
      } finally {
        activeProfileName = undefined
      }
    }
  )

  test('the knob-stripped cases really do drop their knobs', () => {
    // Guards the guard. If `withoutKnobs` stopped removing anything, every
    // assertion above would still pass — and would be testing the knobs.
    const withKnobs = GOLDEN_CASES.filter(
      (c) => Object.keys(c.variables).length !== Object.keys(withoutKnobs(c).variables).length
    )
    expect(withKnobs.map((c) => c.name)).toEqual([
      'verify-by-value-dcql',
      'verify-by-reference-pex',
      'verify-by-value-pex',
      'verify-pex-limit-disclosure-required',
      'verify-pex-limit-disclosure-preferred'
    ])
  })
})

describe('goldens · coverage', () => {
  test('every construction the service emits has a golden', () => {
    // ⚠️ Reconciled by hand against the emit sites, and pinned here so that a
    // construction added later without a golden fails rather than passes.
    expect(GOLDEN_CASES.map((c) => c.name).sort()).toEqual([
      'claim-default',
      'didauth-default',
      'verify-by-reference-pex',
      'verify-by-value-dcql',
      'verify-by-value-pex',
      'verify-default',
      'verify-pex-limit-disclosure-preferred',
      'verify-pex-limit-disclosure-required',
      'verify-signed-jwt-conformant',
      'verify-vpr-bare-origin-domain',
      'verify-vpr-bare-origin-domain-no-accepted-cryptosuites',
      'verify-vpr-no-accepted-cryptosuites',
      'verify-with-claims-dcql'
    ])
  })

  test('every golden names a profile that is actually registered', async () => {
    const { PROTOCOL_PROFILES } = await import('./registry.js')
    for (const testCase of GOLDEN_CASES) {
      expect(Object.keys(PROTOCOL_PROFILES)).toContain(testCase.profile)
    }
  })
})

/**
 * Render-time protocol profile election: serving ONE fetched request under a
 * profile the exchange did not name, without changing the exchange.
 *
 * ## Why this is its own module and not part of `for-exchange.ts`
 *
 * `for-exchange.ts` is the bottom of the resolution stack — `oid4vp/state.ts`
 * and `oid4vp/authorization-request.ts` both read it. The refusals below have to
 * ask those same resolvers what an exchange responds under, so putting them
 * there would make the stack circular. ⚠️ **Do not move this back.** The
 * direction is the invariant: resolution knows nothing about elections;
 * elections are built on top of resolution.
 *
 * ## The one rule everything here follows
 *
 * ⚠️ **An election chooses among constructions the exchange is INDIFFERENT to.
 * It never restates what the exchange is.** Every refusal below is that sentence
 * applied to a different way of stating a construction — a knob, a mint-time
 * profile name, a by-value delivery, or an axis the response leg reads.
 *
 * @see docs/adr/2026-08-25-render-time-protocol-profile-election.md
 */
import { HTTPException } from 'hono/http-exception'
import { getConfig } from '../config.js'
import { PROFILE_SUPERSEDED_VARIABLES } from '../schema.js'
import { resolveClientIdPrefix } from '../oid4vp/authorization-request.js'
import { resolveDelivery, resolveQueryLanguage } from '../oid4vp/state.js'
import { getProtocolProfile } from './registry.js'
import { PROFILED } from './for-exchange.js'
import type { Oid4vpProfileFields, ProfiledWorkflowId, ProtocolProfile } from './types.js'

/**
 * The per-exchange knobs that outrank a profile, read from the schema's own
 * list rather than restated here — derived, never copied.
 *
 * ⚠️ **The nested `variables.oid4vp.*` values are NOT in this list, and that is
 * not an oversight.** `oid4vp.queryLanguage` and `oid4vp.delivery` are
 * *stamped* by `ensureOid4vpState` at the first `request_uri` GET; they record
 * what this exchange was served, they are not something a caller set. Treating
 * them as knobs would make the first wallet fetch permanently disable
 * render-time election on the OID4VP interaction method. {@link
 * electedProfileExchange} drops them from the copy instead — see its docblock.
 */
const ELECTION_BLOCKING_KNOBS = PROFILE_SUPERSEDED_VARIABLES

/**
 * Every OID4VP axis, classified by whether a render-time election may change it.
 *
 * ## Fetchable-only and mint-bound are ONE rule, seen twice
 *
 * A by-value profile cannot be elected because its bytes are minted against a
 * `state` and there is no fetched URL for the election to ride on. The same
 * sentence covers the axes below: a construction the **response** is validated
 * against is a property of the *exchange*, not of one fetch — so it is chosen
 * when the exchange is created, and an election cannot restate it.
 *
 * ⚠️ **`request` does NOT mean "harmless".** It means the axis is spent
 * entirely on the request object the wallet fetches, so serving one request
 * under a different value leaves nothing behind that a later leg reads.
 *
 * ⚠️ **TOTAL, and a test enforces it.** A hand-listed set of "axes that
 * matter" goes stale the moment a field is added — the exact failure M1's audit
 * found, where 17 profile fields were stated and read by nothing.
 * `render-time-election.app.test.ts` asserts every key of
 * `oid4vpProfileFieldsSchema` appears here, so a new field cannot be added
 * without somebody deciding which side of this line it falls on.
 */
export const OID4VP_AXIS_SCOPE = {
  version: 'request',
  deepLinkScheme: 'request',
  delivery: 'exchange',
  queryLanguage: 'exchange',
  clientIdPrefix: 'exchange',
  emitClientIdScheme: 'request',
  requestObjectFormat: 'request',
  requestUriMethod: 'request',
  responseMode: 'request',
  emitResponseUri: 'request',
  requireSignedRequestObject: 'request',
  limitDisclosure: 'request',
  expectedOrigins: 'request'
} as const satisfies Record<keyof Oid4vpProfileFields, 'request' | 'exchange'>

/**
 * One exchange-scoped axis, with the question that actually decides a refusal.
 *
 * ⚠️ **`accepts` is not equality, and it must not be.** The question is not
 * *"did the axis move?"* but *"can the leg that reads this value still handle
 * what was served?"* — which is a weaker and more useful test. The
 * `queryLanguage` entry is the case that proves it: a request serving **both**
 * query languages is still answerable in DCQL, so electing the registered
 * accommodation off a DCQL exchange is honourable, while electing PEX is not.
 * Written as equality, this would refuse the single most useful election there
 * is.
 */
interface ElectionBoundAxis {
  field: keyof Oid4vpProfileFields
  /** ⚠️ WHO reads this value after the request has been served. */
  readBy: string
  /** What this exchange responds under, from the resolver that leg calls. */
  resolve: (
    exchange: App.ExchangeDetailVerify,
    config: App.Config
  ) => string
  /** Can a response resolved as `expected` follow a request served as `served`? */
  accepts: (served: string, expected: string) => boolean
}

/**
 * The axes an election is refused for, each read through **the same resolver
 * the response leg calls**.
 *
 * ⚠️ Derived, never copied. Comparing against a restated default here would put
 * a second statement of the historical defaults beside the resolvers that own
 * them, and the two would disagree the first time one moved.
 */
const ELECTION_BOUND_AXES: ElectionBoundAxis[] = [
  {
    field: 'delivery',
    readBy:
      '`getProtocols`, and the deep link a wallet is already holding — a by-value request is minted against a `state` and issues no fetch at all',
    resolve: (exchange) => resolveDelivery(exchange),
    accepts: (served, expected) => served === expected
  },
  {
    field: 'queryLanguage',
    readBy:
      '`oid4vp/response-handler.ts`, to parse the `vp_token` in the language this exchange asked in — it does not sniff the payload shape, deliberately',
    resolve: (exchange) => resolveQueryLanguage(exchange),
    // ⚠️ **Read as sets, not as equality, and this is the case that proves
    // `accepts` must not be `===`.** The question is whether the parser the
    // response leg will reach for can read an answer to the request that was
    // served. `both` serves each language, so it satisfies either parser; a
    // request serving only PEX cannot be read by a DCQL parser.
    accepts: (served, expected) =>
      servedLanguages(served).includes(parsedLanguage(expected))
  },
  {
    field: 'clientIdPrefix',
    readBy:
      "`oid4vp/response-handler.ts`, to bind the VP proof's `domain` to this exchange's `client_id` — verifier-core does not enforce that, so we must",
    resolve: (exchange, config) => resolveClientIdPrefix(exchange, config),
    accepts: (served, expected) => served === expected
  }
]

/**
 * Which languages a request serving `stated` actually offers a wallet.
 *
 * ⚠️ `both` is a SET, and treating it as a third scalar is how the registered
 * accommodation — the likeliest thing to unstick a real wallet — gets refused by
 * an election check written as equality.
 */
const servedLanguages = (stated: string): string[] =>
  stated === 'both' ? ['dcql', 'pex'] : [stated]

/**
 * Which parser `oid4vp/response-handler.ts` will reach for.
 *
 * ⚠️ **This MIRRORS that handler and must move with it.** It reads
 * `language === 'pex' ? pexSchema : dcqlSchema` — so anything that is not `pex`,
 * `both` included, is parsed as DCQL. Stated here rather than inferred so the
 * mirroring is visible to whoever changes the handler.
 */
const parsedLanguage = (stated: string): string =>
  stated === 'pex' ? 'pex' : 'dcql'

/** The fields {@link ELECTION_BOUND_AXES} covers, for the totality guard. */
export const ELECTION_BOUND_AXIS_FIELDS: Array<keyof Oid4vpProfileFields> =
  ELECTION_BOUND_AXES.map((a) => a.field)

/**
 * Refuse a render-time election this service cannot honour in full.
 *
 * ⚠️ **Loud over lenient, and for a specific reason.** An election that is
 * quietly ignored produces a QR whose bytes disagree with the name in the URL
 * that built it — which is the defect class this whole roadmap exists to
 * remove. A refusal costs a page reload; a half-honoured election reports the
 * wrong answer about a wallet.
 *
 * Four refusals, in the order a caller meets them. ⚠️ **Three of them say the
 * same thing from different directions: an election chooses among constructions
 * the exchange is INDIFFERENT to, and never restates what the exchange is.**
 */
export const assertElectable = (
  exchange: Pick<
    App.ExchangeDetailBase,
    'exchangeId' | 'tenantName' | 'variables' | 'workflowId'
  >,
  protocolProfileName: string,
  config: App.Config = getConfig()
): void => {
  // 1. UNKNOWN NAME → 400. `getProtocolProfile` already throws with the
  //    registered list, which is the message a caller needs; all this adds is
  //    the status, because the caller supplied the name and a 500 would blame
  //    the service for it.
  let profile: ProtocolProfile
  try {
    profile = getProtocolProfile(protocolProfileName)
  } catch (e) {
    throw new HTTPException(400, { message: (e as Error).message })
  }

  // 2. A BY-VALUE PROFILE → 400.
  //
  // ⚠️ Read off the PROFILE, not off `resolveDelivery(exchange)`. The latter
  // answers what this exchange emits today; the question here is what the
  // elected profile would emit.
  //
  // ⚠️ **This is what keeps `getProtocols`'s by-value `state` guard out of
  // reach.** That guard still throws for a mint-bound by-value exchange created
  // outside `createExchangeVerify`; this path simply never arrives there. Do not
  // weaken, relax or route around it.
  const branch = PROFILED.includes(exchange.workflowId)
    ? profile.workflows[exchange.workflowId as ProfiledWorkflowId]
    : undefined
  if (branch?.oid4vp?.delivery === 'by-value') {
    throw new HTTPException(400, {
      message: `Protocol profile "${protocolProfileName}" cannot be elected at render time: it delivers the authorization request by value, so there is no fetched URL for the election to ride on. By-value profiles are mint-bound.`
    })
  }

  // 3. AN EXCHANGE CARRYING EXPLICIT KNOBS → 409.
  //
  // Knob-first precedence (see the file header) means an explicit
  // `oid4vpDelivery` or `oid4vpQueryLanguage` OUTRANKS the elected profile. The
  // election would then be honoured on the axes the knobs do not cover and
  // ignored on the ones they do — a QR that is partly the elected construction
  // and partly not, with nothing on screen or on the wire saying which parts.
  //
  // ⚠️ **Temporary by construction.** M7 retires the knobs and this refusal
  // goes with them; delete it in the same change.
  const knob = ELECTION_BLOCKING_KNOBS.find(
    (k) =>
      (exchange.variables as unknown as Record<string, unknown>)[k] !==
      undefined
  )
  if (knob) {
    throw new HTTPException(409, {
      message: `Exchange ${exchange.exchangeId} was created with an explicit \`${knob}\` knob, which outranks a protocol profile during the migration (see protocol-profiles/for-exchange.ts). A render-time election would therefore be honoured only in part. Re-create the exchange without the knob, or run the test on the exchange as minted.`
    })
  }

  // 4a. AN EXCHANGE THAT ALREADY NAMED ITS OWN PROFILE → 409.
  //
  // ⚠️ **The same intent as the knob above, in the newer vocabulary — and it
  // outlives it.** An exchange minted with `variables.protocolProfileName` has
  // stated what it IS: a test case cites that name, and the journal is written
  // against it. Serving one fetch of it under something else would
  // change the construction under a live exchange, and nothing on the record
  // would say so.
  //
  // ⚠️ **Only the EXCHANGE layer.** A tenant default or `DEFAULT_PROTOCOL_PROFILE`
  // is deployment configuration, not a statement about this exchange, so an
  // election over those is exactly what this feature is for.
  //
  // ⚠️ Naming the profile the exchange ALREADY asks for is allowed, because it
  // changes nothing — the same reason pinning the service default is inert.
  const stated = exchange.variables?.protocolProfileName
  if (stated && stated !== protocolProfileName) {
    throw new HTTPException(409, {
      message: `Exchange ${exchange.exchangeId} was created under the protocol profile "${stated}", which is a statement about what this exchange IS — a run citing it is citing that construction. A render-time election cannot restate it. Re-create the exchange under "${protocolProfileName}", or run the test on the exchange as minted.`
    })
  }

  // 4b. AN ELECTION THAT CHANGES WHAT A LATER LEG READS → 409.
  //
  // ⚠️ **The same rule as the by-value refusal above.** A construction the
  // RESPONSE is validated against is a property of the exchange, not of one
  // fetch. Serving a request under it would produce a submission this service
  // then rejects in the exchange's own vocabulary — a false negative recorded
  // against a wallet, which is worse than not offering the election at all.
  //
  // ⚠️ Read through the resolvers the response leg itself calls, on the real
  // exchange and on the copy, so this check cannot drift from the behaviour it
  // is protecting. See {@link OID4VP_AXIS_SCOPE}.
  if (exchange.workflowId === 'verify') {
    const verify = exchange as App.ExchangeDetailVerify
    const elected = withElectedProfile(verify, protocolProfileName)
    for (const axis of ELECTION_BOUND_AXES) {
      const expected = axis.resolve(verify, config)
      const served = axis.resolve(elected, config)
      if (!axis.accepts(served, expected)) {
        throw new HTTPException(409, {
          message: `Protocol profile "${protocolProfileName}" cannot be elected at render time on exchange ${exchange.exchangeId}: it would serve \`${axis.field}: ${served}\` while this exchange answers under \`${expected}\`. That value is read by ${axis.readBy}, so it is mint-bound — the same rule that makes a by-value profile mint-bound. Re-create the exchange under "${protocolProfileName}".`
        })
      }
    }
  }
}

/**
 * The elected copy, without the refusals — the shape {@link assertElectable}
 * compares against and {@link electedProfileExchange} returns.
 *
 * ⚠️ Private, and it must stay private. The only exported way to obtain this
 * value is `electedProfileExchange`, which refuses first. A caller that could
 * build the copy without the refusals could serve an election this service has
 * already decided it cannot honour.
 */
const withElectedProfile = <T extends App.ExchangeDetailBase>(
  exchange: T,
  protocolProfileName: string
): T => {
  const { oid4vp } = exchange.variables as { oid4vp?: Record<string, unknown> }
  return {
    ...exchange,
    variables: {
      ...exchange.variables,
      protocolProfileName,
      ...(oid4vp
        ? {
            oid4vp: Object.fromEntries(
              Object.entries(oid4vp).filter(
                ([k]) => !STAMPED_CONSTRUCTION_AXES.includes(k)
              )
            )
          }
        : {})
    }
  }
}

/**
 * The `variables.oid4vp` members that state a construction rather than identify
 * a request. Dropped from an elected copy; see {@link electedProfileExchange}.
 */
const STAMPED_CONSTRUCTION_AXES: readonly string[] = [
  'queryLanguage',
  'delivery'
]

/**
 * An exchange as it would be under a render-time elected profile.
 *
 * ⚠️ **A COPY, and it must never be persisted.** Elections are
 * observation-only: a user electing a profile changes the bytes of the request
 * they are about to make, and changes nothing about the exchange — see
 * `docs/adr/2026-08-25-render-time-protocol-profile-election.md`. The rule is
 * enforced by where the value lives — it exists on a copy, for the duration of
 * one request, and `saveExchange` is never called with it.
 *
 * ⚠️ **Why a copy rather than an override parameter.** The exchange-variable
 * layer already means "this exchange asks for this profile", which is exactly
 * what a render-time election means for one request. Threading a
 * `profileOverride` through every resolver would build a second resolution path
 * beside the one that exists, and every resolver added afterwards would have to
 * remember it. This one is honoured by resolvers that have not been written yet.
 *
 * ⚠️ **The stamped OID4VP axes are dropped from the copy, and the mechanism
 * does not work without it.** `ensureOid4vpState` stamps
 * `variables.oid4vp.queryLanguage` and `.delivery` at the first `request_uri`
 * GET, and a stamped value is the MOST specific layer — more specific than the
 * elected profile. Left on the copy, an election of a PEX profile would serve
 * DCQL bytes under a name claiming PEX, which is the silent lie this surface
 * exists to end. A stamp records what this exchange *was served*; the copy
 * answers what it *would emit under profile X*, so the stamp has no standing on
 * it. `state` and `responseReceived` are kept — they are correlation tokens, not
 * construction axes, and the request being built needs the `state`.
 *
 * ⚠️ **KNOWN LIMITATION, and it is on the response leg, not here.** The
 * persisted record keeps the stamp it always had, so `response-handler.ts` parses
 * a submission in the exchange's *own* query language and binds the audience to
 * the exchange's *own* `client_id` prefix. An election that changes either axis
 * therefore serves bytes the response leg is not expecting. See
 * `docs/protocol-profiles.md` § Render-time selection.
 *
 * ⚠️ **Refuses rather than half-honours.** See {@link assertElectable}.
 */
export const electedProfileExchange = <T extends App.ExchangeDetailBase>(
  exchange: T,
  protocolProfileName: string,
  config: App.Config = getConfig()
): T => {
  assertElectable(exchange, protocolProfileName, config)
  return withElectedProfile(exchange, protocolProfileName)
}

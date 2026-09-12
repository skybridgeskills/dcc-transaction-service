/*!
 * Copyright (c) 2023 Digital Credentials Consortium. All rights reserved.
 */
import { HTTPException } from 'hono/http-exception'
import Keyv from 'keyv'
import { createKeyvStore } from './keyv-store.js'
import { journalExchangeEvent } from './journal/index.js'

let keyv: Keyv<App.ExchangeDetailBase>

/**
 * States from which an exchange does not continue. Journalled as `terminal`.
 *
 * `'active'` is not one of them: a verify exchange sits in `active` while the
 * asynchronous Open Badges pass runs, and it still resolves to `complete` or
 * `invalid` afterwards.
 */
const TERMINAL_STATES: ReadonlySet<App.ExchangeState> = new Set([
  'complete',
  'invalid'
])

/**
 * Journal an exchange that has just been persisted in a terminal state.
 *
 * Hooked into the persistence layer rather than into each of the five call
 * sites that assign `state: 'complete' | 'invalid'` (`claimWorkflow`,
 * `didAuthWorkflow`, the OID4VCI credential handler, the verify finaliser and
 * the verify-task sweep). Those five have nothing in common except that they
 * all end up here, and a sixth is exactly the kind of thing a later change
 * adds — a durable record with a hole in it is worse than one with a duplicate
 * line, because absence reads as "did not happen".
 *
 * Every terminal *write* is journalled, not every terminal *transition*.
 * Detecting a transition would mean a read before each write purely to feed the
 * journal, and re-completion is itself a fact worth recording: a wallet that
 * drives an exchange to `complete` twice is a finding, not noise.
 */
const journalIfTerminal = (exchange: App.ExchangeDetailBase): void => {
  if (!TERMINAL_STATES.has(exchange.state)) return
  journalExchangeEvent(exchange, 'terminal', { state: exchange.state })
}

/**
 * Initializes the keyv store for exchange transaction data.
 */
export const initializeTransactionManager = () => {
  if (!keyv) {
    keyv = createKeyvStore<App.ExchangeDetailBase>('exchange')
  }
}
initializeTransactionManager()

/**
 * @throws {} Unknown exchangeID
 * @returns returns stored data if exchangeId exists
 */
export const getExchangeData = async (
  exchangeId: string,
  workflowId: string
) => {
  const storedData = await keyv.get(exchangeId)
  if (!storedData || storedData.workflowId !== workflowId) {
    throw new HTTPException(404, { message: 'Unknown exchangeId.' })
  }
  return storedData
}

/**
 * Retrieves exchange data by exchangeId only, without requiring a workflowId.
 * Used by the interaction URL endpoint where the workflowId is not in the URL path.
 */
export const getExchangeDataById = async (exchangeId: string) => {
  const storedData = await keyv.get(exchangeId)
  if (!storedData) {
    throw new HTTPException(404, { message: 'Unknown exchangeId.' })
  }
  return storedData
}

/**
 * Sets up one exchange and save it to Keyv. The local exchangeId is used as the key for the
 * record. Success/Failure boolean is returned.
 */
export const saveExchange = async (data: App.ExchangeDetailBase) => {
  const ttl = new Date(data.expires).getTime() - Date.now() + 1000
  const success = await keyv.set(data.exchangeId, data, ttl)
  if (!success) {
    throw new HTTPException(500, { message: 'Failed to save exchange.' })
  }
  journalIfTerminal(data)
  return success
}

/**
 * Outcome of a compare-and-swap ({@link saveExchangeWithCAS}) attempt.
 *
 * - `'committed'` — the read-modify-write succeeded; `exchange` is the
 *   value now persisted.
 * - `'stale'` — the on-disk `verifyTask.attemptId` no longer matches
 *   `expectedAttemptId`, meaning a sweep (or another worker) already
 *   superseded this attempt. The caller's update was discarded.
 * - `'not-found'` — the exchange has been evicted (e.g. TTL); nothing
 *   to update.
 */
export type SaveExchangeWithCASResult =
  | { status: 'committed'; exchange: App.ExchangeDetailBase }
  | { status: 'stale'; current: App.ExchangeDetailBase }
  | { status: 'not-found' }

/**
 * Optimistic concurrency wrapper around {@link saveExchange} keyed on
 * `variables.verifyTask.attemptId`.
 *
 * The caller passes an `update` function that receives the current
 * persisted exchange and returns the proposed new value. Before
 * persisting, this helper re-reads the exchange and only commits if
 * the verify-task `attemptId` is still equal to `expectedAttemptId`.
 *
 * This is the *only* way the asynchronous worker should write to a
 * verify exchange: a sweep that bumped the attempt mints a new
 * `attemptId`, so a stale worker's compare-and-swap (CAS) will fail
 * and its partial results will be discarded harmlessly.
 *
 * Synchronous request handlers continue to use plain `saveExchange`;
 * they own the exchange on the request thread and don't need CAS.
 *
 * NOTE: The Keyv backends used here (memory, file, Redis) do not
 * provide a true atomic compare-and-swap. The check-then-set window
 * is small and protected by the JS event loop being single-threaded
 * within a process; cross-process races are out of scope (this
 * service runs as a single replica per the queue design).
 */
export const saveExchangeWithCAS = async (
  exchangeId: string,
  expectedAttemptId: string,
  update: (current: App.ExchangeDetailBase) => App.ExchangeDetailBase
): Promise<SaveExchangeWithCASResult> => {
  const current = await keyv.get(exchangeId)
  if (!current) {
    return { status: 'not-found' }
  }

  const currentAttemptId = readVerifyTaskAttemptId(current)
  if (currentAttemptId !== expectedAttemptId) {
    return { status: 'stale', current }
  }

  const next = update(current)
  const ttl = new Date(next.expires).getTime() - Date.now() + 1000
  const success = await keyv.set(exchangeId, next, ttl)
  if (!success) {
    throw new HTTPException(500, { message: 'Failed to save exchange.' })
  }
  // The async verify path commits only through here, and it owns the one
  // `'invalid'` transition in the service (a verify task that gave up), so the
  // journal hook has to be on both writers.
  journalIfTerminal(next)
  return { status: 'committed', exchange: next }
}

/**
 * Read the `verifyTask.attemptId` off a verify exchange, or `undefined`
 * for non-verify exchanges or when no task is attached.
 */
const readVerifyTaskAttemptId = (
  exchange: App.ExchangeDetailBase
): string | undefined => {
  if (exchange.workflowId !== 'verify') return undefined
  return (exchange as App.ExchangeDetailVerify).variables.verifyTask?.attemptId
}

/**
 * This is meant for testing failures. It deletes the keyv store entirely.
 */
export const clearKeyv = () => {
  // @ts-expect-error intentionally clearing for tests
  keyv = undefined
}

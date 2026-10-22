/**
 * The VP `domain`, end to end on the VC-API routes: stamped at creation,
 * emitted in the VPR, and enforced on the DID-auth proof.
 *
 * ⚠️ Every case signs what a wallet would sign — the `challenge` and `domain`
 * read off the exchange's own VPR — so a pass here is the wire contract, not a
 * restatement of how the service builds the value.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import axios from 'axios'
import { app } from './hono.js'
import * as config from './config.js'
import { getSignedDIDAuth } from './didAuth.js'
import { getExchangeData, saveExchange } from './transactionManager.js'
import testVC from './test-fixtures/testVC.js'

const exchangeHost = 'http://localhost:4005'

beforeEach(() => {
  vi.spyOn(axios, 'post').mockImplementation(() => Promise.resolve({ data: {} }))
  const current = config.getConfig()
  vi.spyOn(config, 'getConfig').mockImplementation(() => ({
    ...current,
    statusService: '',
    tenantAuthenticationEnabled: false
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

const create = async (
  workflowId: 'didAuth' | 'claim',
  variables: Record<string, unknown> = {}
): Promise<string> => {
  const response = await app.request(`/workflows/${workflowId}/exchanges`, {
    method: 'POST',
    body: JSON.stringify({
      variables: {
        tenantName: 'default',
        exchangeHost,
        ...(workflowId === 'claim' && { vc: JSON.stringify(testVC) }),
        ...variables
      }
    }),
    headers: { 'Content-Type': 'application/json' }
  })
  expect(response.status).toBe(200)
  const { iu } = (await response.json()) as { iu: string }
  return new URL(iu).pathname.split('/').pop()!
}

const vprFor = async (workflowId: string, exchangeId: string) => {
  const response = await app.request(
    `/workflows/${workflowId}/exchanges/${exchangeId}`,
    { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } }
  )
  return ((await response.json()) as {
    verifiablePresentationRequest: { challenge: string; domain: string }
  }).verifiablePresentationRequest
}

const present = (workflowId: string, exchangeId: string, vp: unknown) =>
  app.request(`/workflows/${workflowId}/exchanges/${exchangeId}`, {
    method: 'POST',
    body: JSON.stringify(vp),
    headers: { 'Content-Type': 'application/json' }
  })

describe('domain · stamped at creation', () => {
  test('the stamp is on the record and is what the VPR asks for', async () => {
    const exchangeId = await create('didAuth')
    const record = await getExchangeData(exchangeId, 'didAuth')
    expect(record.variables.domain).toBe(exchangeHost)
    expect((await vprFor('didAuth', exchangeId)).domain).toBe(exchangeHost)
  })

  test('a domain sent by the client is not kept', async () => {
    const exchangeId = await create('didAuth', {
      domain: 'https://attacker.example'
    })
    const record = await getExchangeData(exchangeId, 'didAuth')
    expect(record.variables.domain).toBe(exchangeHost)
  })
})

describe.each(['didAuth', 'claim'] as const)('domain · %s enforces it', (workflowId) => {
  test('the requested domain is accepted', async () => {
    const exchangeId = await create(workflowId)
    const { challenge, domain } = await vprFor(workflowId, exchangeId)
    const vp = await getSignedDIDAuth(challenge, undefined, domain)
    expect((await present(workflowId, exchangeId, vp)).status).toBe(200)
  })

  test('no domain is refused, with a problem that names the domain', async () => {
    const exchangeId = await create(workflowId)
    const { challenge } = await vprFor(workflowId, exchangeId)
    const vp = await getSignedDIDAuth(challenge)
    const response = await present(workflowId, exchangeId, vp)
    expect(response.status).toBe(401)
    expect(await response.text()).toMatch(/domain/i)
  })

  test('another domain is refused', async () => {
    const exchangeId = await create(workflowId)
    const { challenge } = await vprFor(workflowId, exchangeId)
    const vp = await getSignedDIDAuth(
      challenge,
      undefined,
      `${exchangeHost}/workflows/${workflowId}/exchanges/${exchangeId}`
    )
    expect((await present(workflowId, exchangeId, vp)).status).toBe(401)
  })
})

describe('domain · exchanges created before the stamp', () => {
  /**
   * ⚠️ An in-flight exchange has no `variables.domain`. It derives the domain
   * its VPR always carried, so a wallet that already fetched that VPR still
   * completes after the deploy.
   */
  test('an unstamped exchange accepts the derived domain', async () => {
    const exchangeId = await create('didAuth')
    const record = await getExchangeData(exchangeId, 'didAuth')
    const { domain: _stamp, ...variables } = record.variables
    await saveExchange({ ...record, variables } as App.ExchangeDetailBase)

    const { challenge, domain } = await vprFor('didAuth', exchangeId)
    expect(domain).toBe(exchangeHost)
    const vp = await getSignedDIDAuth(challenge, undefined, domain)
    expect((await present('didAuth', exchangeId, vp)).status).toBe(200)
  })
})

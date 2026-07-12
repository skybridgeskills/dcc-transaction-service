import { describe, expect, test } from 'vitest'
import { buildDcqlQuery } from './dcql.js'
import { VC_TYPE_IRI, dcqlQuerySchema } from './schemas.js'

describe('buildDcqlQuery', () => {
  test('emits a single ldp_vc credential query with the constant type_values', () => {
    const query = buildDcqlQuery({ vprClaims: [] })
    expect(() => dcqlQuerySchema.parse(query)).not.toThrow()
    expect(query.credentials).toHaveLength(1)
    const [cred] = query.credentials
    expect(cred.id).toBe('credential')
    expect(cred.format).toBe('ldp_vc')
    expect(cred.meta.type_values).toEqual([[VC_TYPE_IRI]])
  })

  test('omits the claims key entirely when vprClaims is empty', () => {
    const query = buildDcqlQuery({ vprClaims: [] })
    expect(query.credentials[0].claims).toBeUndefined()
    expect('claims' in query.credentials[0]).toBe(false)
  })

  test('maps vprClaims 1:1 onto claims, preserving path and values', () => {
    const query = buildDcqlQuery({
      vprClaims: [
        { path: ['credentialSubject', 'achievement', 'name'] },
        { path: ['issuer'], values: ['did:key:z6MkIssuer'] }
      ]
    })
    expect(query.credentials[0].claims).toEqual([
      { path: ['credentialSubject', 'achievement', 'name'] },
      { path: ['issuer'], values: ['did:key:z6MkIssuer'] }
    ])
  })

  test('preserves a claim id when present', () => {
    const query = buildDcqlQuery({
      vprClaims: [{ id: 'name-claim', path: ['name'] }]
    })
    expect(query.credentials[0].claims?.[0]).toEqual({
      id: 'name-claim',
      path: ['name']
    })
  })

  test('does not put vprCredentialType into the query (type_values stays constant)', () => {
    const query = buildDcqlQuery({ vprClaims: [] })
    const flat = JSON.stringify(query)
    expect(flat).not.toContain('OpenBadgeCredential')
    expect(query.credentials[0].meta.type_values).toEqual([[VC_TYPE_IRI]])
  })

  test('honors a custom queryId', () => {
    const query = buildDcqlQuery({ vprClaims: [], queryId: 'my_query' })
    expect(query.credentials[0].id).toBe('my_query')
  })
})

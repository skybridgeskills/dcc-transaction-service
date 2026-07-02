import { describe, expect, test } from 'vitest'
import { HTTPException } from 'hono/http-exception'
import { resolveExchangeTenant } from './resolve-exchange-tenant.js'

const authTenant: App.Tenant = {
  tenantName: 'lit',
  tenantToken: 'secret'
}

describe('resolveExchangeTenant', () => {
  describe('auth enabled (authTenant set)', () => {
    test('body omits tenantName -> token tenant', () => {
      expect(
        resolveExchangeTenant({
          bodyTenantName: undefined,
          authTenant,
          defaultTenantName: 'default'
        })
      ).toBe('lit')
    })

    test('body matches token tenant -> token tenant', () => {
      expect(
        resolveExchangeTenant({
          bodyTenantName: 'lit',
          authTenant,
          defaultTenantName: 'default'
        })
      ).toBe('lit')
    })

    test('body conflicts with token tenant -> 401', () => {
      try {
        resolveExchangeTenant({
          bodyTenantName: 'default',
          authTenant,
          defaultTenantName: 'default'
        })
        throw new Error('expected resolveExchangeTenant to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(HTTPException)
        expect((err as HTTPException).status).toBe(401)
      }
    })
  })

  describe('auth disabled (authTenant undefined)', () => {
    test('body present -> body value', () => {
      expect(
        resolveExchangeTenant({
          bodyTenantName: 'lit',
          authTenant: undefined,
          defaultTenantName: 'default'
        })
      ).toBe('lit')
    })

    test('body omitted -> default tenant name', () => {
      expect(
        resolveExchangeTenant({
          bodyTenantName: undefined,
          authTenant: undefined,
          defaultTenantName: 'default'
        })
      ).toBe('default')
    })
  })
})

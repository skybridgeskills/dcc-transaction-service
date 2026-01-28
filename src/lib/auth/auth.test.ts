import { expect, test, describe } from 'vitest'
import { authenticateTenant } from './auth.js'
import { runInAppContext } from '../app/app-context.js'
import { provideAppContext } from '../app/app-providers.js'
import { createFakeConfigService } from '../services/fake-config-service.js'

describe('tenant authentication', function () {
  describe('tenantAuth disabled, no tenants configured', function () {
    test('returns undefined if no auth header is set', async function () {
      const configService = createFakeConfigService({
        tenantAuthenticationEnabled: false,
        tenants: {}
      })
      const ctx = provideAppContext({ configService })

      await runInAppContext(ctx, async () => {
        const tenant = await authenticateTenant('')
        expect(tenant).toBeUndefined()
      })
    })

    test('returns undefined if auth header is set but no tenant is configured', async function () {
      const configService = createFakeConfigService({
        tenantAuthenticationEnabled: false,
        tenants: {}
      })
      const ctx = provideAppContext({ configService })

      await runInAppContext(ctx, async () => {
        const tenant = await authenticateTenant('default')
        expect(tenant).toBeUndefined()
      })
    })
  })

  describe('tenantAuth disabled, tenants configured', function () {
    test('returns undefined if no auth header is set', async function () {
      const configService = createFakeConfigService({
        tenantAuthenticationEnabled: false,
        tenants: {
          test1: {
            tenantName: 'test1',
            tenantToken: 'test1token'
          },
          test2: {
            tenantName: 'test2',
            tenantToken: 'test2token'
          }
        }
      })
      const ctx = provideAppContext({ configService })

      await runInAppContext(ctx, async () => {
        const tenant = await authenticateTenant('')
        expect(tenant).toBeUndefined()
      })
    })

    test('returns undefined if auth header is set but auth is disabled', async function () {
      const configService = createFakeConfigService({
        tenantAuthenticationEnabled: false,
        tenants: {
          test1: {
            tenantName: 'test1',
            tenantToken: 'test1token'
          },
          test2: {
            tenantName: 'test2',
            tenantToken: 'test2token'
          }
        }
      })
      const ctx = provideAppContext({ configService })

      await runInAppContext(ctx, async () => {
        const tenant = await authenticateTenant('test1token')
        expect(tenant).toBeUndefined()
      })
    })

    test('returns undefined for invalid tenant token', async function () {
      const configService = createFakeConfigService({
        tenantAuthenticationEnabled: false,
        tenants: {
          test1: {
            tenantName: 'test1',
            tenantToken: 'test1token'
          }
        }
      })
      const ctx = provideAppContext({ configService })

      await runInAppContext(ctx, async () => {
        const tenant = await authenticateTenant('invalid')
        expect(tenant).toBeUndefined()
      })
    })
  })

  describe('tenantAuthEnabled, no tenants configured', function () {
    test('returns undefined if no auth header is set', async function () {
      const configService = createFakeConfigService({
        tenantAuthenticationEnabled: true,
        tenants: {
          default: {
            tenantName: 'default',
            tenantToken: 'default'
          }
        }
      })
      const ctx = provideAppContext({ configService })

      await runInAppContext(ctx, async () => {
        const tenant = await authenticateTenant('')
        expect(tenant).toBeUndefined()
      })
    })
  })

  describe('tenantAuthEnabled, tenants configured', function () {
    test('returns undefined if no auth header is set', async function () {
      const configService = createFakeConfigService({
        tenantAuthenticationEnabled: true,
        tenants: {
          test1: {
            tenantName: 'test1',
            tenantToken: 'test1token'
          },
          test2: {
            tenantName: 'test2',
            tenantToken: 'test2token'
          }
        }
      })
      const ctx = provideAppContext({ configService })

      await runInAppContext(ctx, async () => {
        const tenant = await authenticateTenant('')
        expect(tenant).toBeUndefined()
      })
    })

    test('returns tenant based on token', async function () {
      const configService = createFakeConfigService({
        tenantAuthenticationEnabled: true,
        tenants: {
          test1: {
            tenantName: 'test1',
            tenantToken: 'test1token'
          },
          test2: {
            tenantName: 'test2',
            tenantToken: 'test2token'
          }
        }
      })
      const ctx = provideAppContext({ configService })

      await runInAppContext(ctx, async () => {
        const tenant = await authenticateTenant('test1token')
        expect(tenant).toEqual({
          tenantName: 'test1',
          tenantToken: 'test1token'
        })
      })
    })
  })
})

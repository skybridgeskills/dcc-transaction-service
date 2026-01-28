import { expect, test, describe } from 'vitest'
import { getApp } from '../app/app-context.js'
import { runInAppContext } from '../app/app-context.js'
import { provideAppContext } from '../app/app-providers.js'
import { createFakeConfigService } from './fake-config-service.js'

/**
 * Helper function to create test configs for auth service tests
 * Handles common patterns: no tenants (0), single tenant (1), or two tenants (2)
 */
function createAuthTestConfig(options: {
  tenantAuthEnabled: boolean
  tenants?: 0 | 1 | 2 | Record<string, App.Tenant>
  defaultTenantName?: string
}): ReturnType<typeof createFakeConfigService> {
  let tenants: Record<string, App.Tenant> = {}

  if (options.tenants === undefined || options.tenants === 0) {
    tenants = {}
  } else if (options.tenants === 1) {
    const tenantName = options.defaultTenantName || 'default'
    tenants = {
      [tenantName]: {
        tenantName,
        tenantToken: tenantName
      }
    }
  } else if (options.tenants === 2) {
    tenants = {
      test1: {
        tenantName: 'test1',
        tenantToken: 'test1token'
      },
      test2: {
        tenantName: 'test2',
        tenantToken: 'test2token'
      }
    }
  } else {
    // Custom tenants object provided
    tenants = options.tenants
  }

  return createFakeConfigService({
    tenantAuthenticationEnabled: options.tenantAuthEnabled,
    tenants
  })
}

describe('AuthService', function () {
  describe('tenantAuth disabled, no tenants configured', function () {
    test('returns undefined if no auth header is set', async function () {
      const configService = createAuthTestConfig({
        tenantAuthEnabled: false,
        tenants: 0
      })
      const ctx = provideAppContext({ configService })

      await runInAppContext(ctx, async () => {
        const app = getApp()
        if (!app.authService) {
          throw new Error('AuthService not available')
        }
        const tenant = await app.authService.authenticateTenant('')
        expect(tenant).toBeUndefined()
      })
    })

    test('returns undefined if auth header is set but no tenant is configured', async function () {
      const configService = createAuthTestConfig({
        tenantAuthEnabled: false,
        tenants: 0
      })
      const ctx = provideAppContext({ configService })

      await runInAppContext(ctx, async () => {
        const app = getApp()
        if (!app.authService) {
          throw new Error('AuthService not available')
        }
        const tenant = await app.authService.authenticateTenant('default')
        expect(tenant).toBeUndefined()
      })
    })
  })

  describe('tenantAuth disabled, tenants configured', function () {
    test('returns undefined if no auth header is set', async function () {
      const configService = createAuthTestConfig({
        tenantAuthEnabled: false,
        tenants: 2
      })
      const ctx = provideAppContext({ configService })

      await runInAppContext(ctx, async () => {
        const app = getApp()
        if (!app.authService) {
          throw new Error('AuthService not available')
        }
        const tenant = await app.authService.authenticateTenant('')
        expect(tenant).toBeUndefined()
      })
    })

    test('returns undefined if auth header is set but auth is disabled', async function () {
      const configService = createAuthTestConfig({
        tenantAuthEnabled: false,
        tenants: 2
      })
      const ctx = provideAppContext({ configService })

      await runInAppContext(ctx, async () => {
        const app = getApp()
        if (!app.authService) {
          throw new Error('AuthService not available')
        }
        const tenant = await app.authService.authenticateTenant('test1token')
        expect(tenant).toBeUndefined()
      })
    })

    test('returns undefined for invalid tenant token', async function () {
      const configService = createAuthTestConfig({
        tenantAuthEnabled: false,
        tenants: {
          test1: {
            tenantName: 'test1',
            tenantToken: 'test1token'
          }
        }
      })
      const ctx = provideAppContext({ configService })

      await runInAppContext(ctx, async () => {
        const app = getApp()
        if (!app.authService) {
          throw new Error('AuthService not available')
        }
        const tenant = await app.authService.authenticateTenant('invalid')
        expect(tenant).toBeUndefined()
      })
    })
  })

  describe('tenantAuthEnabled, no tenants configured', function () {
    test('returns undefined if no auth header is set', async function () {
      const configService = createAuthTestConfig({
        tenantAuthEnabled: true,
        tenants: 1
      })
      const ctx = provideAppContext({ configService })

      await runInAppContext(ctx, async () => {
        const app = getApp()
        if (!app.authService) {
          throw new Error('AuthService not available')
        }
        const tenant = await app.authService.authenticateTenant('')
        expect(tenant).toBeUndefined()
      })
    })
  })

  describe('tenantAuthEnabled, tenants configured', function () {
    test('returns undefined if no auth header is set', async function () {
      const configService = createAuthTestConfig({
        tenantAuthEnabled: true,
        tenants: 2
      })
      const ctx = provideAppContext({ configService })

      await runInAppContext(ctx, async () => {
        const app = getApp()
        if (!app.authService) {
          throw new Error('AuthService not available')
        }
        const tenant = await app.authService.authenticateTenant('')
        expect(tenant).toBeUndefined()
      })
    })

    test('returns tenant based on token', async function () {
      const configService = createAuthTestConfig({
        tenantAuthEnabled: true,
        tenants: 2
      })
      const ctx = provideAppContext({ configService })

      await runInAppContext(ctx, async () => {
        const app = getApp()
        if (!app.authService) {
          throw new Error('AuthService not available')
        }
        const tenant = await app.authService.authenticateTenant('test1token')
        expect(tenant).toEqual({
          tenantName: 'test1',
          tenantToken: 'test1token'
        })
      })
    })
  })
})

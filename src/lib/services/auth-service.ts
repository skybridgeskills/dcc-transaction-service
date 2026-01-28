/**
 * AuthService interface and implementation for tenant authentication
 */

import { getApp } from '../app/app-context.js'

export interface AuthService {
  /**
   * Gets a tenant by name and/or token
   * @param options Tenant lookup options
   * @returns Tenant if found, undefined otherwise
   */
  getTenant(options: {
    tenantName?: string
    tenantToken?: string
  }): Promise<App.Tenant | undefined>

  /**
   * Authenticates a tenant by token
   * @param tenantToken Tenant authentication token
   * @returns Tenant if authenticated, undefined otherwise
   */
  authenticateTenant(tenantToken: string): Promise<App.Tenant | undefined>
}

/**
 * RealAuthService implementation using config service
 */
export class RealAuthService implements AuthService {
  async getTenant({
    tenantName,
    tenantToken
  }: {
    tenantName?: string
    tenantToken?: string
  }): Promise<App.Tenant | undefined> {
    const app = getApp()
    const config = app.configService.getConfig()
    if (!config.tenantAuthenticationEnabled) {
      return undefined
    }

    if (tenantName && !tenantToken) {
      return config.tenants[tenantName]
    }
    if (tenantToken && !tenantName) {
      return Object.values(config.tenants).find(
        (t) => t.tenantToken === tenantToken
      )
    }
    if (
      tenantName &&
      tenantToken &&
      config.tenants[tenantName].tenantToken === tenantToken
    ) {
      return config.tenants[tenantName]
    }
    return undefined
  }

  async authenticateTenant(
    tenantToken: string
  ): Promise<App.Tenant | undefined> {
    const app = getApp()
    const config = app.configService.getConfig()
    if (!config.tenantAuthenticationEnabled) {
      return
    }

    // If no auth header is set and no tenants are configured, use the default tenant
    // without authentication.
    if (tenantToken === undefined && config.tenants[config.defaultTenantName]) {
      return config.tenants[config.defaultTenantName]
    }

    const tenant = await this.getTenant({ tenantToken })
    return tenant
  }
}

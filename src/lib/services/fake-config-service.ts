import type { ConfigService } from './config-service.js'

/**
 * FakeConfigService - provides config for testing
 * Allows tests to provide custom tenant configurations
 */
export class FakeConfigService implements ConfigService {
  private config: App.Config

  constructor(config: App.Config) {
    this.config = config
  }

  getConfig(): App.Config {
    return this.config
  }
}

/**
 * Factory function to create a FakeConfigService with test tenants
 */
export function createFakeConfigService(
  overrides: Partial<App.Config> = {}
): FakeConfigService {
  const baseConfig = {
    port: 4004,
    defaultExchangeHost: 'http://localhost:4004',
    exchangeTtl: 600,
    statusService: '',
    signingService: 'http://localhost:4006',
    defaultWorkflow: 'didAuth',
    defaultTenantName: 'default',
    tenants: {},
    tenantAuthenticationEnabled: false,
    keyvWriteDelayMs: 100,
    keyvExpiredCheckDelayMs: 14400000,
    defaultTrustedRegistries: ['DCC Sandbox Registry', 'DCC Issuer Registry']
  } as App.Config

  const config = { ...baseConfig, ...overrides } as App.Config

  // Ensure tenantAuthenticationEnabled matches tenant configuration
  // Only auto-enable if not explicitly set in overrides
  if (
    overrides.tenantAuthenticationEnabled === undefined &&
    overrides.tenants &&
    Object.keys(overrides.tenants).length > 0
  ) {
    config.tenantAuthenticationEnabled = true
  }

  return new FakeConfigService(config)
}

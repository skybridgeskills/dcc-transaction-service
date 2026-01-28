import { getConfig } from '../config/config.js'
import type { ConfigService } from './config-service.js'

/**
 * DefaultConfigService - wraps the existing getConfig() function
 * Used in production and when no custom config service is provided
 */
export class DefaultConfigService implements ConfigService {
  getConfig(): App.Config {
    return getConfig()
  }
}

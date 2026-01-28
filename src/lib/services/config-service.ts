import type { App } from '../../app.d.js'

export interface ConfigService {
  /**
   * Gets the current configuration
   */
  getConfig(): App.Config
}

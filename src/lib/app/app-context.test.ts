import { describe, test, expect } from 'vitest'
import { getApp, runInAppContext } from './app-context.js'
import { createFakeConfigService } from '../services/fake-config-service.js'

describe('app-context', () => {
  test('getApp returns default context when no context is set', () => {
    const app = getApp()
    expect(app).toBeDefined()
    expect(app.configService).toBeDefined()
    expect(app.configService.getConfig()).toBeDefined()
  })

  test('runInAppContext sets context correctly', () => {
    const testConfigService = createFakeConfigService({ port: 9999 })
    const testContext = {
      configService: testConfigService,
      customService: 'test-service'
    }

    const result = runInAppContext(testContext, () => {
      const app = getApp()
      expect(app.configService).toBe(testContext.configService)
      expect(app.configService.getConfig().port).toBe(9999)
      expect(app.customService).toBe('test-service')
      return 'success'
    })

    expect(result).toBe('success')
  })

  test('getApp returns context set by runInAppContext', () => {
    const testConfigService = createFakeConfigService({ port: 8888 })
    const testContext = {
      configService: testConfigService
    }

    runInAppContext(testContext, () => {
      const app = getApp()
      expect(app.configService).toBe(testContext.configService)
      expect(app.configService.getConfig().port).toBe(8888)
    })
  })
})

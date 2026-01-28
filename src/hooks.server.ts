import type { Handle, HandleServerError } from '@sveltejs/kit'
import { sequence } from '@sveltejs/kit/hooks'
import { error } from '@sveltejs/kit'
import { runInAppContext } from './lib/app/app-context.js'
import { provideAppContext } from './lib/app/app-providers.js'
import { getApp } from './lib/app/app-context.js'

/**
 * Sets up app context for each request
 */
const setupAppContext: Handle = async ({ event, resolve }) => {
  // Create app context for this request using provider pattern
  const appContext = provideAppContext()

  // Run the request handler within the app context
  return runInAppContext(appContext, () => {
    // Attach context to event.locals for SvelteKit access
    event.locals.ctx = appContext
    return resolve(event)
  })
}

/**
 * Authentication middleware
 */
const authenticate: Handle = async ({ event, resolve }) => {
  const config = event.locals.ctx?.configService.getConfig()

  // Only authenticate if tenant authentication is enabled
  if (!config?.tenantAuthenticationEnabled) {
    return resolve(event)
  }

  // Extract Authorization header
  const authHeader = event.request.headers.get('authorization')

  // If Authorization header is present, it must be properly formatted
  if (authHeader) {
    const parts = authHeader.split(' ')
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw error(401, { message: 'Improperly formatted Bearer token' })
    }

    const tenantToken = parts[1]
    const app = getApp()
    if (!app.authService) {
      throw error(500, { message: 'AuthService not available' })
    }
    const tenant = await app.authService.authenticateTenant(tenantToken)

    if (!tenant) {
      throw error(401, { message: 'Unauthorized' })
    }

    // Attach tenant to locals if authenticated
    event.locals.authTenant = tenant
  }

  return resolve(event)
}

/**
 * Error handler
 */
export const handleError: HandleServerError = ({ error, event }) => {
  console.error('Error in request:', error)

  return {
    message:
      error instanceof Error ? error.message : 'An unexpected error occurred',
    code: 500
  }
}

/**
 * Main handle function - sequences all middleware
 */
export const handle: Handle = sequence(setupAppContext, authenticate)

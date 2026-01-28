import { AsyncLocalStorage } from 'node:async_hooks'
import type { AppContext, InitialAppContext } from './app-types.js'
import { provideAppContext } from './app-providers.js'

/**
 * AsyncLocalStorage instance for storing app context per request
 */
const appContextStore = new AsyncLocalStorage<AppContext>()

/**
 * Gets the current app context from async local storage
 * @param initialCtx Optional initial context (for testing or custom initialization)
 * @returns The current app context
 */
export function getApp(initialCtx?: InitialAppContext): AppContext {
  const current = appContextStore.getStore()
  if (current) {
    return current
  }

  // If no context exists, create a default context using provider pattern
  return provideAppContext(initialCtx)
}

/**
 * Runs a function within a specific app context
 * Used by hooks.server.ts to set context for each request
 * @param context The app context to use
 * @param fn The function to run
 * @returns The result of the function
 */
export function runInAppContext<T>(context: AppContext, fn: () => T): T {
  return appContextStore.run(context, fn)
}

/**
 * Gets the current app context store (for advanced use cases)
 * @returns The AsyncLocalStorage instance
 */
export function getAppContextStore(): AsyncLocalStorage<AppContext> {
  return appContextStore
}

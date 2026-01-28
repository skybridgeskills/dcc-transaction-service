/**
 * Test wrapper for running code with test app context
 * Allows tests to inject fake services and override configuration
 */

import { runInAppContext } from './app-context.js';
import { provideAppContext } from './app-providers.js';
import type { AppContext } from './app-types.js';

/**
 * Runs a function within a test app context
 * @param testContext Partial app context to override defaults
 * @param fn Function to run within the test context
 * @returns Result of the function
 */
export function runInTestContext<T>(
	testContext: Partial<AppContext>,
	fn: () => T
): T {
	const fullContext = provideAppContext(testContext);
	return runInAppContext(fullContext, fn);
}

/**
 * Async version of runInTestContext
 */
export async function runInTestContextAsync<T>(
	testContext: Partial<AppContext>,
	fn: () => Promise<T>
): Promise<T> {
	const fullContext = provideAppContext(testContext);
	return runInAppContext(fullContext, fn);
}

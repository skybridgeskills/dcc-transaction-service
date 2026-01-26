import type { Handle, HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { getApp, runInAppContext } from './lib/app/app-context.js';
import { getConfig } from './lib/config/config.js';
import { authenticateTenant } from './lib/auth/auth.js';

/**
 * Sets up app context for each request
 */
const setupAppContext: Handle = async ({ event, resolve }) => {
	const config = getConfig();
	
	// Create app context for this request
	const appContext = {
		config,
		// Services will be added here via provider pattern later
	};

	// Run the request handler within the app context
	return runInAppContext(appContext, () => {
		// Attach context to event.locals for SvelteKit access
		event.locals.ctx = appContext;
		return resolve(event);
	});
};

/**
 * Authentication middleware
 * Migrated from Hono middleware
 */
const authenticate: Handle = async ({ event, resolve }) => {
	const config = getConfig();
	
	// Only authenticate if tenant authentication is enabled
	if (!config.tenantAuthenticationEnabled) {
		return resolve(event);
	}

	// Extract Authorization header
	const authHeader = event.request.headers.get('authorization');
	const tenantToken = authHeader?.startsWith('Bearer ')
		? authHeader.slice(7)
		: undefined;

	// Authenticate tenant
	const tenant = await authenticateTenant(tenantToken || '');

	// Attach tenant to locals if authenticated
	if (tenant) {
		event.locals.authTenant = tenant;
	}

	return resolve(event);
};

/**
 * Error handler
 */
export const handleError: HandleServerError = ({ error, event }) => {
	console.error('Error in request:', error);
	
	return {
		message: error instanceof Error ? error.message : 'An unexpected error occurred',
		code: 500
	};
};

/**
 * Main handle function - sequences all middleware
 */
export const handle: Handle = sequence(setupAppContext, authenticate);

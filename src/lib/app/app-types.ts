/**
 * App context types
 * Defines the shape of the app context that will be available via getApp()
 */

export interface AppContext {
	// Services will be added here as we create them
	// For now, this is a placeholder
	[key: string]: unknown;
}

/**
 * Initial context that can be passed to getApp()
 * Allows overriding environment variables for testing
 */
export interface InitialAppContext {
	env?: {
		public?: Record<string, string>;
		private?: Record<string, string>;
	};
	[key: string]: unknown;
}

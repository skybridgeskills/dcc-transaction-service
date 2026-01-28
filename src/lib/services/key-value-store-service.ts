/**
 * KeyValueStoreService interface for storing exchange data
 */

import type { App } from '../../app.d.js';

export interface KeyValueStoreService {
	/**
	 * Gets a value by key
	 * @param key The key to retrieve
	 * @returns The value or undefined if not found
	 */
	get<T = App.ExchangeDetailBase>(key: string): Promise<T | undefined>;

	/**
	 * Sets a value with optional TTL
	 * @param key The key to set
	 * @param value The value to store
	 * @param ttl Optional time-to-live in milliseconds
	 * @returns true if successful
	 */
	set<T = App.ExchangeDetailBase>(key: string, value: T, ttl?: number): Promise<boolean>;

	/**
	 * Deletes a value by key
	 * @param key The key to delete
	 * @returns true if deleted, false if not found
	 */
	delete(key: string): Promise<boolean>;

	/**
	 * Clears all values (useful for testing)
	 */
	clear(): Promise<void>;
}

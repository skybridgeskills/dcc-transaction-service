/**
 * RedisKeyValueStoreService - Redis-backed Keyv implementation
 * Used in production when redisUri is configured
 */

import KeyvRedis from '@keyv/redis';
import Keyv from 'keyv';
import type { KeyValueStoreService } from './key-value-store-service.js';
import type { App } from '../../app.d.js';
import type { App as AppTypes } from '../../app.d.js';

export class RedisKeyValueStoreService implements KeyValueStoreService {
	private keyv: Keyv<App.ExchangeDetailBase>;

	constructor(config: AppTypes.Config) {
		if (!config.redisUri) {
			throw new Error('Redis URI is required for RedisKeyValueStoreService');
		}

		const hasPort = config.redisUri.includes('6379');
		this.keyv = new Keyv<App.ExchangeDetailBase>(
			new KeyvRedis(
				{
					url: hasPort ? config.redisUri : `rediss://${config.redisUri}:6379`,
					socket: { tls: hasPort ? false : true }
				},
				{ namespace: 'exchange' }
			)
		);
	}

	async get<T = App.ExchangeDetailBase>(key: string): Promise<T | undefined> {
		return (await this.keyv.get(key)) as T | undefined;
	}

	async set<T = App.ExchangeDetailBase>(key: string, value: T, ttl?: number): Promise<boolean> {
		const success = await this.keyv.set(key, value as App.ExchangeDetailBase, ttl);
		return !!success;
	}

	async delete(key: string): Promise<boolean> {
		return await this.keyv.delete(key);
	}

	async clear(): Promise<void> {
		await this.keyv.clear();
	}
}

import { describe, test, expect } from 'vitest';
import { getApp, runInAppContext } from './app-context.js';

describe('app-context', () => {
	test('getApp returns default context when no context is set', () => {
		const app = getApp();
		expect(app).toBeDefined();
		expect(app.config).toBeDefined();
	});

	test('runInAppContext sets context correctly', () => {
		const testContext = {
			config: { test: 'value' } as any,
			customService: 'test-service'
		};

		const result = runInAppContext(testContext, () => {
			const app = getApp();
			expect(app.config).toBe(testContext.config);
			expect(app.customService).toBe('test-service');
			return 'success';
		});

		expect(result).toBe('success');
	});

	test('getApp returns context set by runInAppContext', () => {
		const testContext = {
			config: { test: 'value' } as any
		};

		runInAppContext(testContext, () => {
			const app = getApp();
			expect(app.config).toBe(testContext.config);
		});
	});
});

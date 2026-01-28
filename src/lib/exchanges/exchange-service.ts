/**
 * ExchangeService implementation using exchange-manager
 */

import type { ExchangeService } from '../services/exchange-service.js';
import {
	getExchangeById as getExchangeByIdImpl,
	getExchangeData as getExchangeDataImpl,
	saveExchange as saveExchangeImpl,
	clearKeyv
} from './exchange-manager.js';

export class ExchangeServiceImpl implements ExchangeService {
	async getExchangeById(exchangeId: string): Promise<App.ExchangeDetailBase> {
		return getExchangeByIdImpl(exchangeId);
	}

	async getExchangeData(exchangeId: string, workflowId: string): Promise<App.ExchangeDetailBase> {
		return getExchangeDataImpl(exchangeId, workflowId);
	}

	async saveExchange(data: App.ExchangeDetailBase): Promise<boolean> {
		return saveExchangeImpl(data);
	}

	async clearExchanges(): Promise<void> {
		return clearKeyv();
	}
}

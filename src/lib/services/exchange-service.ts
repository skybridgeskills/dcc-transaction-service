/**
 * ExchangeService interface for managing exchanges
 */

export interface ExchangeService {
	/**
	 * Retrieves an exchange by exchangeId only, without workflowId validation.
	 * Used for endpoints like /interactions/:exchangeId where workflowId is not known upfront.
	 * @throws {Error} Unknown exchangeId
	 * @returns Exchange data if exchangeId exists
	 */
	getExchangeById(exchangeId: string): Promise<App.ExchangeDetailBase>;

	/**
	 * Retrieves exchange data if exchangeId exists and workflowId matches
	 * @throws {Error} Unknown exchangeId or workflowId mismatch
	 * @returns Exchange data if exchangeId exists and workflowId matches
	 */
	getExchangeData(exchangeId: string, workflowId: string): Promise<App.ExchangeDetailBase>;

	/**
	 * Saves an exchange to storage
	 * @param data The exchange data to save
	 * @returns Success boolean
	 */
	saveExchange(data: App.ExchangeDetailBase): Promise<boolean>;

	/**
	 * Clears all exchanges (for testing)
	 */
	clearExchanges(): Promise<void>;
}

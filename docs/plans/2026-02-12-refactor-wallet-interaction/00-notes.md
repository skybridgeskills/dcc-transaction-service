# Notes: Refactor Wallet Interaction

## Analysis

The `WalletSelector` component currently uses server-side `exchangeService` to:
1. Fetch exchange data via `exchangeService.getExchangeData(exchangeId, workflowId)`
2. Extract protocols via `exchangeService.getExchangeProtocols(exchange)`

However, exchange data is already available in the UI context (passed from `+page.server.ts` to `InteractionPage.svelte`), and the protocol extraction logic can be moved to a client-side utility since all dependencies are frontend-safe.

### Current Dependencies

The `getExchangeProtocols` method uses these functions, all of which are frontend-safe:
- `getDIDAuthVPR` - from `src/lib/protocols/vpr-generation.ts`
- `getVerifyVPR` - from `src/lib/protocols/vpr-generation.ts`
- `getLcwProtocol` - from `src/protocols/lcw.ts`
- `generateCredentialOfferUrl` - from `src/lib/protocols/oid4vci/url-utils.ts`
- `generateDeepLinkUrl` - from `src/lib/protocols/oid4vci/url-utils.ts`

### Current Flow

1. `+page.server.ts` loads exchange data and passes it to `InteractionPage.svelte`
2. `InteractionPage.svelte` passes `exchangeId` and `workflowId` to `WalletSelector`
3. `WalletSelector` fetches exchange data again via `exchangeService.getExchangeData()`
4. `WalletSelector` extracts protocols via `exchangeService.getExchangeProtocols()`

### Proposed Flow

1. `+page.server.ts` loads exchange data and passes it to `InteractionPage.svelte`
2. `InteractionPage.svelte` passes exchange data directly to `WalletSelector`
3. `WalletSelector` uses client-side utility to extract protocols from exchange data

## Questions

### Q1: Where should the client-side exchange utilities be located?

**Context:** We need to create a client-side utility function `getExchangeProtocols` that mirrors the server-side implementation but without server dependencies.

**Answer:** Create `src/lib/exchange/exchange-utils.ts` to house client-side exchange utilities. Put relevant exchange-related utilities here. If moving any existing code, make sure to address tests of the code.

### Q2: Should WalletSelector accept exchange data as a prop, or continue accepting exchangeId/workflowId?

**Context:** Currently `WalletSelector` accepts `exchangeId` and `workflowId` and fetches exchange data internally. We could change it to accept exchange data directly.

**Answer:** Give `WalletSelector` an HTTP client dependency (UI-only service) that can be used to fetch exchange data. In Storybook, we can pass in a fake version. 

**Location:** Create `src/lib/services/ui/` for UI-side HTTP clients to distinguish from backend services:
- `src/lib/services/` = backend services (server-side, use KeyValueStore, etc.)
- `src/lib/services/ui/` = UI-side HTTP clients (client-side, use fetch/HTTP)

This approach:
- Keeps the component flexible (can fetch when needed)
- Makes it testable via dependency injection
- Separates UI services from backend services

### Q3: What about other components that use exchangeService?

**Context:** `ExchangeStatusPoll` also uses `exchangeService.getExchangeState()`. Should we refactor that as well, or focus only on `WalletSelector`?

**Answer:** Also refactor `ExchangeStatusPoll` to use the same UI-side client approach. Both components will use the UI-side exchange client to fetch exchange data.

### Q4: How should we handle Storybook and test fixtures?

**Context:** `WalletSelector.stories.svelte` and test files currently use `exchangeService` from storybook helpers.

**Answer:** Create a fake exchange client that meets the same interface as the real service client. Enable the fake client to be configured to return its default dummy data or custom data. Make sure the interface for this client service and for the fake configurations is efficient.

This approach:
- Provides a clean testing/mocking interface
- Allows easy configuration for different test scenarios
- Maintains type safety with the real client interface

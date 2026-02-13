# Plan: Refactor Wallet Interaction

## Overview

Refactor `WalletSelector` and `ExchangeStatusPoll` components to use a UI-side exchange client instead of server-side `exchangeService`. This separates frontend and backend concerns, making components more testable and removing server-side dependencies from UI code.

**Success Criteria:**

- `WalletSelector` and `ExchangeStatusPoll` no longer depend on server-side `exchangeService`
- Client-side exchange utilities extract protocols from exchange data
- UI-side exchange client fetches exchange data via HTTP
- Fake exchange client enables easy Storybook/testing configuration
- All existing functionality preserved
- Tests and Storybook stories updated and passing

## Phases

1. Create client-side exchange utilities
2. Create UI-side exchange client interface and implementation
3. Create fake exchange client for testing/Storybook
4. Refactor WalletSelector to use exchange client
5. Refactor ExchangeStatusPoll to use exchange client
6. Update Storybook stories
7. Update tests
8. Cleanup and validation

## Design

### File Structure

```
src/lib/
├── services/
│   └── ui/                           # NEW - UI-side HTTP clients
│       ├── exchange-client.ts        # NEW - Exchange client interface and implementation
│       └── exchange-client.test.ts   # NEW - Tests for exchange client
├── exchange/                         # NEW - Client-side exchange utilities
│   └── exchange-utils.ts             # NEW - Protocol extraction utilities
├── test-fixtures/
│   ├── fake-exchange-client.ts       # NEW - Fake client for testing/Storybook
│   └── fake-exchange-client.test.ts  # NEW - Tests for fake client
├── components/
│   ├── wallet-selector/
│   │   ├── WalletSelector.svelte     # UPDATE - Use exchange client
│   │   └── WalletSelector.stories.svelte  # UPDATE - Use fake client
│   └── exchange-status/
│       ├── ExchangeStatusPoll.svelte     # UPDATE - Use exchange client
│       └── ExchangeStatusPoll.stories.svelte  # UPDATE - Use fake client
└── pages/
    └── InteractionPage.svelte        # UPDATE - Pass exchange client to components
```

### Architecture

**UI-Side Exchange Client:**

- Interface: `ExchangeClient` with methods:
  - `getExchangeData(exchangeId, workflowId): Promise<ExchangeDetailBase>`
  - `getExchangeState(exchangeId, workflowId): Promise<ExchangeDetailBase>`
- Implementation: `HttpExchangeClient` uses `fetch()` to call:
  - `GET /workflows/:workflowId/exchanges/:exchangeId` for exchange data
- Fake: `FakeExchangeClient` implements same interface with configurable in-memory data

**Client-Side Exchange Utilities:**

- `getExchangeProtocols(exchange): ExchangeProtocols` - Extracts protocols from exchange data
- Uses existing frontend-safe functions:
  - `getDIDAuthVPR`, `getVerifyVPR` from `src/lib/protocols/vpr-generation.ts`
  - `getLcwProtocol` from `src/protocols/lcw.ts`
  - `generateCredentialOfferUrl`, `generateDeepLinkUrl` from `src/lib/protocols/oid4vci/url-utils.ts`

**Component Changes:**

- `WalletSelector` accepts `exchangeClient: ExchangeClient` prop
- `ExchangeStatusPoll` accepts `exchangeClient: ExchangeClient` prop
- Both components use client to fetch data instead of server-side service

## Phase 1: Create Client-Side Exchange Utilities

**Description:** Extract protocol extraction logic from server-side `exchangeService` into client-side utilities.

**Success Criteria:**

- `getExchangeProtocols` function exists in `src/lib/exchange/exchange-utils.ts`
- Function signature matches server-side implementation
- Function uses only frontend-safe dependencies
- Tests pass for protocol extraction

**Implementation Notes:**

- Move protocol extraction logic from `exchangeService.getExchangeProtocols()` to `src/lib/exchange/exchange-utils.ts`
- Import frontend-safe dependencies:
  - `getDIDAuthVPR`, `getVerifyVPR` from `src/lib/protocols/vpr-generation.ts`
  - `getLcwProtocol` from `src/protocols/lcw.ts`
  - `generateCredentialOfferUrl`, `generateDeepLinkUrl` from `src/lib/protocols/oid4vci/url-utils.ts`
- Export function: `export function getExchangeProtocols(exchange: App.ExchangeDetailBase): ExchangeProtocols`
- Create tests in `src/lib/exchange/exchange-utils.test.ts`
- Test with different workflow types (claim, didAuth, verify)
- Ensure tests cover all protocol types (iu, vcapi, lcw, OID4VCI, verifiablePresentationRequest)

## Phase 2: Create UI-Side Exchange Client Interface and Implementation

**Description:** Create the exchange client interface and HTTP implementation for fetching exchange data.

**Success Criteria:**

- `ExchangeClient` interface defined in `src/lib/services/ui/exchange-client.ts`
- `HttpExchangeClient` class implements the interface
- Client fetches data from `/workflows/:workflowId/exchanges/:exchangeId`
- Error handling for HTTP errors (404, 500, etc.)
- Tests pass for HTTP client

**Implementation Notes:**

- Create `src/lib/services/ui/exchange-client.ts`:
  - Define `ExchangeClient` interface with:
    - `getExchangeData(exchangeId: string, workflowId: string): Promise<App.ExchangeDetailBase>`
    - `getExchangeState(exchangeId: string, workflowId: string): Promise<App.ExchangeDetailBase>`
  - Implement `HttpExchangeClient` class:
    - Constructor accepts optional `baseUrl` (defaults to current origin)
    - Methods use `fetch()` to call endpoints
    - Handle HTTP errors and convert to appropriate Error types
    - `getExchangeData` and `getExchangeState` both call same endpoint (GET `/workflows/:workflowId/exchanges/:exchangeId`)
- Create tests in `src/lib/services/ui/exchange-client.test.ts`:
  - Mock `fetch()` for testing
  - Test successful responses
  - Test error cases (404, 500, network errors)
  - Test URL construction

## Phase 3: Create Fake Exchange Client for Testing/Storybook

**Description:** Create a fake exchange client that implements the same interface with configurable data.

**Success Criteria:**

- `FakeExchangeClient` class implements `ExchangeClient` interface
- Client can be configured with default dummy data or custom data
- Efficient configuration interface
- Tests pass for fake client

**Implementation Notes:**

- Create `src/lib/test-fixtures/fake-exchange-client.ts`:
  - Implement `FakeExchangeClient` class:
    - Constructor accepts optional config:
      - `exchanges?: Record<string, App.ExchangeDetailBase>` - Custom exchange data
      - `defaultExchange?: App.ExchangeDetailBase` - Default exchange to return if not found
    - Store exchanges in Map for efficient lookup
    - `getExchangeData` and `getExchangeState`:
      - Look up exchange by key: `${workflowId}:${exchangeId}`
      - If not found and `defaultExchange` provided, return default
      - If not found, throw Error with 404-like message
  - Export helper function: `createFakeExchangeClient(config?)` for easy creation
- Create tests in `src/lib/test-fixtures/fake-exchange-client.test.ts`:
  - Test with custom exchanges
  - Test with default exchange fallback
  - Test error when exchange not found
  - Test efficient lookup

## Phase 4: Refactor WalletSelector to Use Exchange Client

**Description:** Update `WalletSelector` to use `ExchangeClient` instead of server-side `exchangeService`.

**Success Criteria:**

- `WalletSelector` accepts `exchangeClient: ExchangeClient` prop
- Component uses client to fetch exchange data
- Component uses client-side utilities to extract protocols
- Component behavior unchanged
- No server-side dependencies

**Implementation Notes:**

- Update `src/lib/components/wallet-selector/WalletSelector.svelte`:
  - Add `exchangeClient: ExchangeClient` to Props interface
  - Remove any `exchangeService` usage/imports
  - Import `getExchangeProtocols` from `src/lib/exchange/exchange-utils.ts`
  - Update `loadExchangeProtocols()`:
    - Use `exchangeClient.getExchangeData(exchangeId, workflowId)` instead of `exchangeService.getExchangeData()`
    - Use `getExchangeProtocols(exchange)` instead of `exchangeService.getExchangeProtocols(exchange)`
  - Update `selectWallet()`:
    - Use `exchangeClient.getExchangeData(exchangeId, workflowId)` instead of `exchangeService.getExchangeData()`
    - Use `getExchangeProtocols(exchange)` instead of `exchangeService.getExchangeProtocols(exchange)`
- Ensure error handling works correctly
- Ensure loading states work correctly

## Phase 5: Refactor ExchangeStatusPoll to Use Exchange Client

**Description:** Update `ExchangeStatusPoll` to use `ExchangeClient` instead of server-side `exchangeService`.

**Success Criteria:**

- `ExchangeStatusPoll` accepts `exchangeClient: ExchangeClient` prop
- Component uses client to fetch exchange state
- Component behavior unchanged
- No server-side dependencies

**Implementation Notes:**

- Update `src/lib/components/exchange-status/ExchangeStatusPoll.svelte`:
  - Replace `exchangeService: ExchangeService` prop with `exchangeClient: ExchangeClient`
  - Remove `ExchangeService` import
  - Import `ExchangeClient` from `src/lib/services/ui/exchange-client.ts`
  - Update `checkExchangeStatus()`:
    - Use `exchangeClient.getExchangeState(exchangeId, workflowId)` instead of `exchangeService.getExchangeState()`
- Ensure error handling works correctly
- Ensure polling behavior works correctly

## Phase 6: Update Storybook Stories

**Description:** Update Storybook stories to use fake exchange client instead of `exchangeService`.

**Success Criteria:**

- All Storybook stories updated
- Stories use `FakeExchangeClient` with appropriate test data
- Stories render correctly
- No server-side dependencies in stories

**Implementation Notes:**

- Update `src/lib/components/wallet-selector/WalletSelector.stories.svelte`:
  - Import `createFakeExchangeClient` from `src/lib/test-fixtures/fake-exchange-client.ts`
  - Replace `exchangeService` setup with `exchangeClient` setup
  - Update story args to pass `exchangeClient` prop
  - Use `createStorybookExchangeData` to create exchange data
  - Configure fake client with exchange data
- Update `src/lib/components/exchange-status/ExchangeStatusPoll.stories.svelte`:
  - Import `createFakeExchangeClient` from `src/lib/test-fixtures/fake-exchange-client.ts`
  - Replace `exchangeService` setup with `exchangeClient` setup
  - Update story args to pass `exchangeClient` prop
  - Configure fake client with exchange data
- Update `src/lib/pages/InteractionPage.stories.svelte`:
  - Update to pass `exchangeClient` to components
  - Use fake client with appropriate exchange data
- Verify all stories render correctly in Storybook

## Phase 7: Update Tests

**Description:** Update component tests to use fake exchange client.

**Success Criteria:**

- All component tests updated
- Tests use `FakeExchangeClient` with test data
- Tests pass
- No server-side dependencies in tests

**Implementation Notes:**

- Update `src/lib/components/wallet-selector/WalletSelector.test.ts` (if exists):
  - Replace `exchangeService` mocks with `FakeExchangeClient` instances
  - Configure fake client with test exchange data
  - Update test assertions as needed
- Update `src/lib/components/exchange-status/ExchangeStatusPoll.test.ts` (if exists):
  - Replace `exchangeService` mocks with `FakeExchangeClient` instances
  - Configure fake client with test exchange data
  - Update test assertions as needed
- Update any integration tests that use these components
- Ensure all tests pass

## Phase 8: Update InteractionPage and Cleanup

**Description:** Update `InteractionPage` to pass exchange client to components and clean up any remaining references.

**Success Criteria:**

- `InteractionPage` creates/passes exchange client to components
- No remaining `exchangeService` references in UI code
- All code compiles
- All tests pass
- All warnings addressed

**Implementation Notes:**

- Update `src/lib/pages/InteractionPage.svelte`:
  - Import `HttpExchangeClient` from `src/lib/services/ui/exchange-client.ts`
  - Create exchange client instance (can use default constructor for current origin)
  - Pass `exchangeClient` prop to `WalletSelector` and `ExchangeStatusPoll`
- Update `src/routes/interactions/[exchangeId]/+page.svelte`:
  - Remove `exchangeService` derivation if no longer needed
  - Ensure `InteractionPage` receives exchange data correctly
- Search codebase for any remaining `exchangeService` references in UI code:
  - `grep -r "exchangeService" src/lib/components/ src/lib/pages/`
  - Remove or update as needed
- Run build and fix any compilation errors
- Run tests and fix any failures
- Run Storybook and verify stories work
- Check for linter warnings and fix (except unused code for future phases)

## Phase 9: Cleanup and Finalization

**Description:** Final cleanup, remove temporary code, ensure everything works.

**Success Criteria:**

- No temporary code, TODOs, or debug prints
- All tests pass
- All code compiles without warnings
- Code is clean and readable
- Validation script passes

**Implementation Notes:**

- Remove any temporary code or debug statements
- Fix all linter warnings
- Ensure all tests pass:
  - `cd dcc/dcc-transaction-service && pnpm test`
- Ensure build succeeds:
  - `cd dcc/dcc-transaction-service && pnpm build`
- Run validation script if available
- Review code for readability and consistency
- Commit with message: `refactor(dcc-transaction-service): wallet interaction - remove server-side exchangeService dependency`

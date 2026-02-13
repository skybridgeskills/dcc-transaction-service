# Plan: Consolidate Exchange State Management

## Overview

Consolidate exchange state management in `InteractionPage` to eliminate redundant HTTP fetches and ensure predictable, coordinated fetching. Currently, both `WalletSelector` and `ExchangeStatusPoll` independently fetch exchange data, resulting in multiple unnecessary requests.

**Success Criteria:**
- Exchange data is fetched a precise number of times on a predictable schedule
- No redundant HTTP fetches from child components
- `InteractionPage` manages all exchange state reactively
- `WalletSelector` receives exchange data as prop (no fetching)
- `ExchangeStatusPoll` manages polling timing/UI and triggers fetches via callback
- All existing functionality preserved
- Tests and Storybook stories updated and passing

## Phases

1. Refactor InteractionPage to manage reactive exchange state
2. Refactor WalletSelector to accept exchange data prop
3. Refactor ExchangeStatusPoll to use callback-based fetching
4. Update Storybook stories
5. Update tests
6. Cleanup and validation

## Design

### File Structure

```
src/lib/
├── pages/
│   └── InteractionPage.svelte              # UPDATE - Manage exchange state and polling
├── components/
│   ├── wallet-selector/
│   │   └── WalletSelector.svelte            # UPDATE - Accept exchange prop, remove fetching
│   └── exchange-status/
│       └── ExchangeStatusPoll.svelte        # UPDATE - Accept exchange prop and callback
```

### Architecture

**InteractionPage:**
- Accepts optional `exchangeClient?: ExchangeClient` prop (defaults to `new HttpExchangeClient()`)
- Maintains reactive exchange state: `let currentExchange = $state(exchange)` initialized from prop
- Manages polling logic:
  - Starts polling when state is 'pending' or 'active'
  - Polls at configurable interval (default: 3000ms)
  - Stops when state is 'complete' or 'invalid'
  - Respects max polls limit (default: 40)
- Provides `onPollRequest` callback to `ExchangeStatusPoll` that:
  - Fetches exchange data via `exchangeClient.getExchangeState()`
  - Updates `currentExchange` state
  - Returns the updated exchange or error

**WalletSelector:**
- Accepts `exchange: App.ExchangeDetailBase` prop (replaces `exchangeId`, `workflowId`, `exchangeClient`)
- Removes all HTTP fetching logic
- Uses `getExchangeProtocols()` directly on the exchange prop
- Reacts automatically to exchange prop changes

**ExchangeStatusPoll:**
- Accepts `exchange: App.ExchangeDetailBase` prop (replaces `exchangeId`, `workflowId`, `exchangeClient`)
- Accepts `onPollRequest: () => Promise<App.ExchangeDetailBase>` callback prop
- Manages polling timing and UI display
- Calls `onPollRequest()` callback when polling interval triggers
- Displays exchange state, polling status, and controls
- No direct HTTP fetching

**Data Flow:**
1. `InteractionPage` receives initial `exchange` prop from server
2. `InteractionPage` initializes reactive `currentExchange` state
3. `InteractionPage` passes `currentExchange` to `WalletSelector` and `ExchangeStatusPoll`
4. `ExchangeStatusPoll` manages polling timing and calls `onPollRequest()` callback
5. `InteractionPage`'s `onPollRequest` fetches and updates `currentExchange`
6. All components react to `currentExchange` updates automatically

## Phase 1: Refactor InteractionPage to Manage Reactive Exchange State

**Description:** Update `InteractionPage` to manage exchange state reactively and handle polling logic.

**Success Criteria:**
- `InteractionPage` accepts optional `exchangeClient` prop (defaults to new instance)
- Reactive `currentExchange` state initialized from `exchange` prop
- Polling logic implemented in `InteractionPage`
- `onPollRequest` callback function provided
- Polling starts/stops based on exchange state
- All derived values use `currentExchange` instead of `exchange`

**Implementation Notes:**
- Update `InteractionPage.svelte`:
  - Add optional `exchangeClient?: ExchangeClient` prop (default: `new HttpExchangeClient()`)
  - Create reactive state: `let currentExchange = $state(exchange)`
  - Add polling state: `let isPolling = $state(false)`, `let statusCheckCount = $state(0)`, `let isPaused = $state(false)`
  - Add polling config props: `pollInterval?: number = 3000`, `maxPolls?: number = 40`
  - Implement `onPollRequest` async function:
    - Set `isPolling = true`
    - Call `exchangeClient.getExchangeState(currentExchange.exchangeId, currentExchange.workflowId)`
    - Update `currentExchange` with result
    - Increment `statusCheckCount`
    - Handle errors appropriately
    - Set `isPolling = false`
  - Implement polling logic in `$effect`:
    - Start polling when `currentExchange.state === 'pending' || currentExchange.state === 'active'`
    - Stop polling when `currentExchange.state === 'complete' || currentExchange.state === 'invalid'`
    - Stop polling when `statusCheckCount >= maxPolls`
    - Use `setInterval` to call `onPollRequest` at `pollInterval`
    - Clean up interval on unmount or when stopping
  - Update all derived values to use `currentExchange`:
    - `credentialData` derived from `currentExchange`
    - `verificationContent` derived from `currentExchange`
    - `claimContent` derived from `currentExchange`
  - Update conditional rendering to use `currentExchange.state`
- Ensure polling cleanup happens correctly
- Ensure error handling works correctly

## Phase 2: Refactor WalletSelector to Accept Exchange Data Prop

**Description:** Update `WalletSelector` to accept exchange data as prop and remove HTTP fetching.

**Success Criteria:**
- `WalletSelector` accepts `exchange: App.ExchangeDetailBase` prop
- Removed `exchangeId`, `workflowId`, and `exchangeClient` props
- Removed all HTTP fetching logic
- Component uses `getExchangeProtocols(exchange)` directly
- Component reacts to exchange prop changes
- All functionality preserved

**Implementation Notes:**
- Update `WalletSelector.svelte`:
  - Change Props interface:
    - Remove: `exchangeId: string`, `workflowId: App.SupportedWorkflowIds`, `exchangeClient: ExchangeClient`
    - Add: `exchange: App.ExchangeDetailBase`
  - Remove `exchangeClient` import
  - Update `loadExchangeProtocols()`:
    - Remove HTTP fetch call
    - Use `getExchangeProtocols(exchange)` directly
    - Use `exchange.exchangeId` and `exchange.workflowId` for any needed references
  - Update `selectWallet()`:
    - Remove HTTP fetch call
    - Use `getExchangeProtocols(exchange)` directly
  - Update `$effect`:
    - Remove `exchangeId` and `workflowId` dependencies
    - Add `exchange` dependency
    - Call `loadExchangeProtocols()` when exchange changes
- Ensure component reacts correctly to exchange prop updates
- Ensure error handling still works (for protocol extraction errors)

## Phase 3: Refactor ExchangeStatusPoll to Use Callback-Based Fetching

**Description:** Update `ExchangeStatusPoll` to accept exchange data and callback, removing direct HTTP fetching.

**Success Criteria:**
- `ExchangeStatusPoll` accepts `exchange: App.ExchangeDetailBase` prop
- `ExchangeStatusPoll` accepts `onPollRequest: () => Promise<App.ExchangeDetailBase>` callback prop
- Removed `exchangeId`, `workflowId`, and `exchangeClient` props
- Removed direct HTTP fetching logic
- Polling timing logic preserved
- Component calls `onPollRequest()` callback when polling triggers
- Component displays exchange state from prop
- All functionality preserved

**Implementation Notes:**
- Update `ExchangeStatusPoll.svelte`:
  - Change Props interface:
    - Remove: `exchangeId: string`, `workflowId: App.SupportedWorkflowIds`, `exchangeClient: ExchangeClient`
    - Add: `exchange: App.ExchangeDetailBase`, `onPollRequest: () => Promise<App.ExchangeDetailBase>`
  - Remove `ExchangeClient` import
  - Update `checkExchangeStatus()`:
    - Remove HTTP fetch call
    - Call `onPollRequest()` callback instead
    - Update local `exchange` state with result (or use prop directly if reactive)
    - Handle errors from callback
  - Update `$effect`:
    - Remove `exchangeId` and `workflowId` dependencies
    - Add `exchange` dependency for display purposes
    - Keep polling timing logic
  - Consider: Should component maintain local `exchange` state or just use prop?
    - If prop is reactive, can use prop directly
    - If need to track "last fetched" vs "current displayed", may need local state
    - Simplest: Use prop directly, parent manages state
- Ensure polling timing works correctly
- Ensure error handling works correctly
- Ensure UI updates correctly when exchange prop changes

## Phase 4: Update InteractionPage to Pass Props to Children

**Description:** Update `InteractionPage` to pass correct props to `WalletSelector` and `ExchangeStatusPoll`.

**Success Criteria:**
- `InteractionPage` passes `exchange={currentExchange}` to `WalletSelector`
- `InteractionPage` passes `exchange={currentExchange}` and `onPollRequest={onPollRequest}` to `ExchangeStatusPoll`
- Removed `exchangeId`, `workflowId`, and `exchangeClient` props from children
- All components receive correct props

**Implementation Notes:**
- Update `InteractionPage.svelte`:
  - Update `WalletSelector` usage:
    - Change from: `exchangeId={exchange.exchangeId} workflowId={exchange.workflowId} {exchangeClient}`
    - Change to: `exchange={currentExchange}`
  - Update `ExchangeStatusPoll` usage:
    - Change from: `exchangeId={exchange.exchangeId} workflowId={exchange.workflowId} {exchangeClient}`
    - Change to: `exchange={currentExchange} onPollRequest={onPollRequest}`
- Ensure props are passed correctly
- Ensure reactive updates flow correctly

## Phase 5: Update Storybook Stories

**Description:** Update Storybook stories to use new prop interfaces.

**Success Criteria:**
- All Storybook stories updated
- Stories pass `exchange` prop instead of `exchangeId`/`workflowId`/`exchangeClient`
- Stories pass `onPollRequest` callback to `ExchangeStatusPoll`
- Stories render correctly
- No compilation errors

**Implementation Notes:**
- Update `WalletSelector.stories.svelte`:
  - Update story args to pass `exchange` prop
  - Use `createStorybookExchangeData` to create exchange data
  - Remove `exchangeClient` prop
- Update `ExchangeStatusPoll.stories.svelte`:
  - Update story args to pass `exchange` prop
  - Add `onPollRequest` callback that returns exchange data
  - Remove `exchangeClient` prop
  - Mock callback to return exchange data or simulate updates
- Update `InteractionPage.stories.svelte`:
  - Ensure stories work with new prop structure
  - May need to provide `onPollRequest` callback if testing polling
- Verify all stories render correctly in Storybook

## Phase 6: Update Tests

**Description:** Update component tests to use new prop interfaces.

**Success Criteria:**
- All component tests updated
- Tests pass `exchange` prop instead of `exchangeId`/`workflowId`/`exchangeClient`
- Tests pass `onPollRequest` callback to `ExchangeStatusPoll`
- Tests pass
- No compilation errors

**Implementation Notes:**
- Update `WalletSelector.test.ts` (if exists):
  - Update test setup to pass `exchange` prop
  - Remove `exchangeClient` mocks
  - Update assertions as needed
- Update `ExchangeStatusPoll.test.ts` (if exists):
  - Update test setup to pass `exchange` prop and `onPollRequest` callback
  - Mock `onPollRequest` callback
  - Remove `exchangeClient` mocks
  - Update assertions as needed
- Update `InteractionPage.test.ts` (if exists):
  - Update test setup for new prop structure
  - Test polling logic
  - Test callback handling
- Ensure all tests pass

## Phase 7: Cleanup and Validation

**Description:** Final cleanup, remove temporary code, ensure everything works.

**Success Criteria:**
- No temporary code, TODOs, or debug prints
- All tests pass
- All code compiles without warnings
- Code is clean and readable
- Build succeeds
- Storybook works

**Implementation Notes:**
- Remove any temporary code or debug statements
- Fix all linter warnings
- Ensure all tests pass:
  - `cd dcc/dcc-transaction-service && pnpm test`
- Ensure build succeeds:
  - `cd dcc/dcc-transaction-service && pnpm build`
- Verify Storybook stories work
- Review code for readability and consistency
- Check that polling behavior is correct:
  - Polling starts when exchange is pending/active
  - Polling stops when exchange is complete/invalid
  - Polling respects max polls limit
  - Polling cleanup works correctly
- Commit with message: `refactor(dcc-transaction-service): consolidate exchange state management`

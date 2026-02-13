# Notes: Consolidate Exchange State Management

## Analysis

Currently, both `WalletSelector` and `ExchangeStatusPoll` independently fetch exchange data via HTTP:
- `WalletSelector` calls `exchangeClient.getExchangeData()` in `loadExchangeProtocols()` and `selectWallet()`
- `ExchangeStatusPoll` calls `exchangeClient.getExchangeState()` in `checkExchangeStatus()` on a polling interval

This results in:
- Redundant HTTP requests (same data fetched multiple times)
- Unpredictable fetch timing (components fetch independently)
- No centralized state management
- Exchange data passed as initial prop but not kept in sync

### Current Flow

1. `InteractionPage` receives initial `exchange` prop from server
2. `InteractionPage` creates `HttpExchangeClient` and passes it to children
3. `WalletSelector` fetches exchange data independently when it loads
4. `ExchangeStatusPoll` fetches exchange data independently on polling interval
5. No coordination between components

### Proposed Flow

1. `InteractionPage` manages exchange state reactively
2. `InteractionPage` accepts optional `exchangeClient` prop (defaults to new instance)
3. `InteractionPage` fetches exchange data on a predictable schedule
4. `InteractionPage` passes current exchange data down to components
5. `ExchangeStatusPoll` manages polling timing and triggers fetches via events
6. `WalletSelector` receives exchange data as prop (no fetching)

## Questions

### Q1: Should ExchangeStatusPoll be deleted or kept with event-based architecture?

**Context:** The user suggests two options:
1. Keep `ExchangeStatusPoll` but have it pass up events to `InteractionPage` to trigger fetches
2. Delete `ExchangeStatusPoll` and manage all polling state in `InteractionPage`

**Answer:** Keep `ExchangeStatusPoll` but refactor it to be event-based using a callback prop. This maintains separation of concerns:
- `ExchangeStatusPoll` manages polling timing/logic and UI display
- `InteractionPage` manages exchange state and HTTP fetching
- Clear separation: polling component triggers fetches via callback, parent manages state

### Q2: How should WalletSelector receive exchange data?

**Context:** Currently `WalletSelector` accepts `exchangeId`, `workflowId`, and `exchangeClient` and fetches data itself.

**Answer:** Change `WalletSelector` to accept `exchange: App.ExchangeDetailBase` prop instead of `exchangeId`/`workflowId`/`exchangeClient`. Remove exchangeId/workflowId completely (clean break). This:
- Removes HTTP fetching from WalletSelector
- Makes component more testable (pure data input)
- Simplifies component logic
- Allows parent to control when data is fetched

### Q3: What should be the polling strategy in InteractionPage?

**Context:** Need to determine when and how often to fetch exchange data.

**Answer:** Manage polling entirely in InteractionPage. Polling strategy:
- Initial state: Use the exchange prop passed from server (no initial fetch needed)
- Polling: Start polling when exchange state is 'pending' or 'active'
- Polling interval: Configurable prop (default: 3000ms)
- Stop polling: When exchange state is 'complete' or 'invalid'
- Max polls: Configurable prop (default: 40)

ExchangeStatusPoll will only display status and trigger fetches via callback, but InteractionPage manages all polling logic.

### Q4: How should exchange state updates be handled?

**Context:** When exchange data is fetched, it should update the reactive state and trigger UI updates.

**Answer:** Use Svelte's reactive state (`$state`) for exchange data in `InteractionPage`. Initialize reactive state from the initial exchange prop, then update it when fetches occur. All derived values and child components will automatically react to the update.

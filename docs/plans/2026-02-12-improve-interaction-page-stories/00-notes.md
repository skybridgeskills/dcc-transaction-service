# Notes: Improve InteractionPage Stories

## Analysis

### Current Problems

1. **Real HTTP Requests in Stories**: Stories are making real HTTP requests that 404 because they're using the default `HttpExchangeClient` instead of a fake client
2. **Silent Error Handling**: HTTP errors (like 404) are caught but not displayed to the user - they're silently swallowed in the `onPollRequest` catch block
3. **Status Count Display**: Currently just shows "Checks: 0/40" as text - needs a visual status bar that empties as checks count down
4. **Polling State**: All stories start polling regardless of exchange state - pending stories should poll, complete/error stories should not

### Current Implementation

- `InteractionPage` accepts optional `exchangeClient` prop (defaults to `HttpExchangeClient`)
- `FakeExchangeClient` exists and can be configured with exchange data
- `createStorybookSetup` helper exists to create fake clients
- Error handling in `onPollRequest` catches errors but doesn't update UI state
- `ExchangeStatusPoll` component shows status but uses simple text display
- Resume polling functionality exists but could be more visible

## Questions

### Q1: How should HTTP errors be handled and displayed?

**Context:** Currently, when `exchangeClient.getExchangeState()` throws an error (like 404), it's caught in `onPollRequest` but the error is silently ignored. The user sees no indication that something went wrong.

**Answer:** ✅ REVISED
- Track error as a separate stateful variable in `InteractionPage` (not modify `exchange.state`)
- Catch HTTP errors in `onPollRequest` and call an `onError` callback that updates the error state
- Use existing `ErrorDisplay` component to display errors
- May not display `ExchangeStatusPoll` when there's an error state
- This provides cleaner separation of concerns - error state is separate from exchange state

### Q2: What should the status bar visual design be?

**Context:** Currently shows "Checks: 0/40" as text. Need a visual progress bar that empties as checks count down.

**Answer:** ✅ APPROVED
- Replace text with a progress bar component
- Status bar empties down (40→0) showing remaining checks
- No count text displayed - just visual bar
- Color progression: not-too-bright green → pale yellow as it empties
- Dark mode support with cohesive color palette
- When it reaches 0, show paused state with resume button prominently displayed
- Use existing UI components (Card, Button) for consistency

### Q3: Should the FakeExchangeClient in stories return the same exchange or simulate state changes?

**Context:** Stories need to test the polling behavior. Should the fake client always return the same exchange data, or should it simulate state transitions (e.g., pending → complete)?

**Answer:** ✅ APPROVED - Simple approach
- Return the same exchange data for each story (simple, predictable)
- No state transformations for now - will add smart state transformations in the future
- The visual status bar will show the checks counting down even if state doesn't change

### Q4: How should stories configure polling behavior?

**Context:** Pending stories should start polling immediately, complete/error stories should not poll.

**Answer:** ✅ APPROVED
- Stories already pass `exchange` prop with correct state
- `InteractionPage` already checks state before polling (lines 93-98, 139-144)
- Just ensure stories pass fake exchange client so no real HTTP requests are made
- No additional configuration needed - component handles it automatically

### Q5: Should we add error state tracking separate from exchange.state?

**Context:** HTTP errors might occur even when exchange.state is still 'pending'. Should we track errors separately?

**Answer:** ✅ REVISED (aligned with Q1)
- Track error as a separate stateful variable in `InteractionPage`
- When HTTP error occurs in `onPollRequest`, call `onError` callback to update error state
- Use existing `ErrorDisplay` component to display errors (accepts `error` prop with `status` field)
- May hide `ExchangeStatusPoll` when error state is present
- Keep exchange.state unchanged - error state is separate concern

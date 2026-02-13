# Plan: Improve InteractionPage Stories

## Overview

Improve the `InteractionPage` component and its Storybook stories to:
1. Use fake exchange clients in stories (prevent real HTTP requests)
2. Properly handle and display HTTP errors (404, network errors, etc.)
3. Add visual status bar showing checks remaining (empties from green to yellow)
4. Ensure pending stories start polling, complete/error stories don't poll

**Success Criteria:**
- Stories use `FakeExchangeClient` - no real HTTP requests
- HTTP errors are caught and displayed using `ErrorDisplay` component
- Status bar visually shows checks remaining (40→0) with color progression
- Pending stories automatically start polling, complete/error stories don't poll
- All tests pass, build succeeds

## Phases

1. Add error state tracking to InteractionPage
2. Update ExchangeStatusPoll with visual status bar
3. Update stories to use FakeExchangeClient
4. Test and validation

## Design

### File Structure

```
src/lib/
├── pages/
│   ├── InteractionPage.svelte              # UPDATE: Add error state, error handling
│   └── InteractionPage.stories.svelte     # UPDATE: Use FakeExchangeClient
└── components/
    └── exchange-status/
        └── ExchangeStatusPoll.svelte      # UPDATE: Visual status bar, error display
```

### Architecture

**Error Handling Flow:**
```
onPollRequest() → exchangeClient.getExchangeState()
  ↓ (on error)
catch → onError callback → update error state
  ↓
InteractionPage renders ErrorDisplay (hide ExchangeStatusPoll if error)
```

**Status Bar:**
- Visual progress bar showing remaining checks
- Color: green (40 checks) → yellow (0 checks)
- Dark mode support with cohesive palette
- Hide when paused, show resume button prominently

**Story Configuration:**
- Each story creates exchange data with appropriate state
- Stories pass `FakeExchangeClient` configured with exchange data
- Component automatically handles polling based on exchange state

## Phase 1: Add Error State Tracking to InteractionPage

**Description:**
Add error state tracking to `InteractionPage` component. Catch HTTP errors in `onPollRequest` and update error state via callback. Display errors using `ErrorDisplay` component.

**Success Criteria:**
- Error state tracked as separate stateful variable
- HTTP errors caught in `onPollRequest` and passed to error handler
- `ErrorDisplay` component shown when error occurs
- `ExchangeStatusPoll` hidden when error state present
- Error state can be cleared/reset

**Implementation Notes:**
- Add `let error = $state<Error | { message?: string; status?: number } | null>(null)`
- Create `onError` callback function that sets error state
- Update `onPollRequest` catch block to call `onError(e)`
- Extract error status from Error objects (check for `status` property or Error message)
- Conditionally render `ErrorDisplay` when error is present
- Conditionally hide `ExchangeStatusPoll` when error is present
- Use `ErrorDisplay` component with `error` prop (supports `status` field)

## Phase 2: Update ExchangeStatusPoll with Visual Status Bar

**Description:**
Replace text-based "Checks: 0/40" display with visual status bar that empties as checks count down. Use color progression from green to yellow. Support dark mode.

**Success Criteria:**
- Text "Checks: X / Y" removed
- Visual status bar shows remaining checks (40→0)
- Color progression: green (40) → yellow (0)
- Dark mode colors are cohesive
- Status bar hidden when paused
- Resume button prominently displayed when paused

**Implementation Notes:**
- Calculate remaining checks: `maxPolls - statusCheckCount`
- Calculate fill percentage: `(maxPolls - statusCheckCount) / maxPolls`
- Create progress bar using div with background color
- Use Tailwind classes for colors:
  - Green: `bg-green-500` → `bg-green-200` (light), `dark:bg-green-600` → `dark:bg-green-800` (dark)
  - Yellow: `bg-yellow-500` → `bg-yellow-200` (light), `dark:bg-yellow-600` → `dark:bg-yellow-800` (dark)
- Use outline/border for progress bar container
- Animate color transition smoothly
- Hide status bar section when `isPaused` is true
- Show resume button prominently when paused

## Phase 3: Update Stories to Use FakeExchangeClient

**Description:**
Update all Storybook stories to use `FakeExchangeClient` instead of default `HttpExchangeClient`. Configure fake client with exchange data for each story.

**Success Criteria:**
- All stories pass `exchangeClient` prop with `FakeExchangeClient`
- Fake client configured with appropriate exchange data
- No real HTTP requests made in stories
- Pending stories start polling automatically
- Complete/error stories don't poll

**Implementation Notes:**
- Import `createStorybookSetup` or `createFakeExchangeClient` from `storybook-helpers`
- For each story, create fake client with exchange data:
  ```ts
  const { exchangeClient } = createStorybookSetup({
    'verify-exchange-123': verifyExchangePending
  })
  ```
- Pass `exchangeClient` prop to `InteractionPage` component
- Verify pending stories (`VerificationPending`, `ClaimPending`) start polling
- Verify complete/error stories don't poll (component handles this automatically)

## Phase 4: Test and Validation

**Description:**
Run tests, verify build succeeds, check Storybook stories render correctly.

**Success Criteria:**
- All tests pass
- Build succeeds without errors
- Storybook stories render correctly
- No console errors in browser
- Status bar animates correctly
- Error display works for 404 and other errors
- Polling behavior correct for each story state

**Implementation Notes:**
- Run `pnpm build` from `dcc-transaction-service` directory
- Run `pnpm test` if tests exist
- Open Storybook and verify each story:
  - `VerificationPending`: Shows status bar, starts polling
  - `VerificationComplete`: No polling, shows success
  - `VerificationInvalid`: No polling, shows error
  - `ClaimPending`: Shows status bar, starts polling
  - `ClaimComplete`: No polling, shows success
  - `ClaimInvalid`: No polling, shows error
- Verify status bar counts down visually
- Verify error handling works (can test by making fake client throw errors)

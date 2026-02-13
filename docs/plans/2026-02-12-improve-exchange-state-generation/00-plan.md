# Plan: Improve Exchange State Generation

## Overview

Improve exchange state generation functions (`createStorybookClaimExchange`, `createStorybookDidAuthExchange`, `createStorybookVerifyExchange`, `createStorybookExchangeData`) to automatically apply base variables, eliminating TypeScript errors when creating exchange data in Storybook stories.

**Success Criteria:**
- Functions accept partial variables without requiring base variables (`exchangeHost`, `challenge`)
- TypeScript types reflect that base variables are provided by default
- Base variables can still be overridden if needed
- All four functions updated consistently
- No type errors in Storybook stories
- All existing functionality preserved

## Phases

1. Update type definitions for exchange creation functions
2. Update function implementations to ensure proper merging
3. Update Storybook stories to remove unnecessary base variables
4. Test and validate

## Design

### File Structure

```
src/lib/test-fixtures/
└── storybook-exchange-data.ts    # UPDATE - Improve type definitions and implementations
```

### Architecture

**Type Strategy:**
- Use `Omit` to exclude base variables from required fields in override types
- Create helper type: `StorybookExchangeOverrides<T>` that:
  - Makes `variables` field optional
  - If `variables` provided, makes base variables optional via `Partial<Pick<Variables, keyof BaseVariables>>`
  - Makes workflow-specific variables optional via `Partial<Omit<Variables, keyof BaseVariables>>`
  - Allows full override if all variables provided

**Implementation Strategy:**
- Functions already merge base variables correctly
- Update type definitions to match implementation behavior
- Ensure base variables are always provided (with defaults)
- Allow override of base variables if explicitly provided

## Phase 1: Update Type Definitions for Exchange Creation Functions

**Description:** Create helper types and update function signatures to allow partial variables without requiring base variables.

**Success Criteria:**
- Helper type `StorybookExchangeOverrides` created
- All four functions use updated type definitions
- TypeScript accepts partial variables without base variables
- Base variables can still be overridden
- Type safety maintained for workflow-specific variables

**Implementation Notes:**
- Create helper type in `storybook-exchange-data.ts`:
  ```typescript
  type StorybookExchangeOverrides<T extends App.ExchangeDetailBase> = 
    Omit<Partial<T>, 'variables'> & {
      variables?: Partial<Omit<T['variables'], keyof App.BaseVariables>> & 
                  Partial<Pick<T['variables'], keyof App.BaseVariables>>
    }
  ```
- Update `createStorybookExchangeData`:
  - Change `overrides` parameter type to use helper type
  - Ensure base variables are always merged
- Update `createStorybookClaimExchange`:
  - Change `overrides` parameter type to `StorybookExchangeOverrides<App.ExchangeDetailClaim>`
  - Ensure base variables merged correctly
- Update `createStorybookDidAuthExchange`:
  - Change `overrides` parameter type to `StorybookExchangeOverrides<App.ExchangeDetailDidAuth>`
  - Ensure base variables merged correctly
- Update `createStorybookVerifyExchange`:
  - Change `overrides` parameter type to `StorybookExchangeOverrides<App.ExchangeDetailVerify>`
  - Ensure base variables merged correctly
- Test type definitions compile without errors

## Phase 2: Update Function Implementations to Ensure Proper Merging

**Description:** Verify and update function implementations to ensure base variables are always merged correctly.

**Success Criteria:**
- All functions merge base variables before workflow-specific variables
- Base variables can be overridden if provided
- Workflow-specific variables merge correctly
- No runtime errors

**Implementation Notes:**
- Review `createStorybookExchangeData`:
  - Ensure base variables (`exchangeHost`, `challenge`, `tenantName`) are always set
  - Verify merge order: base → workflow-specific → overrides
- Review `createStorybookClaimExchange`:
  - Ensure base variables merged before `vc` variable
  - Verify merge order: base → `vc` → overrides
- Review `createStorybookDidAuthExchange`:
  - Ensure base variables merged correctly
  - Verify merge order: base → overrides
- Review `createStorybookVerifyExchange`:
  - Ensure base variables merged before verify-specific variables
  - Verify merge order: base → verify-specific → overrides
- Ensure all functions handle undefined `overrides.variables` correctly

## Phase 3: Update Storybook Stories to Remove Unnecessary Base Variables

**Description:** Update Storybook stories to use simplified variable definitions without base variables.

**Success Criteria:**
- All Storybook stories updated
- No base variables (`exchangeHost`, `challenge`) in story variable definitions
- Stories compile without type errors
- Stories render correctly

**Implementation Notes:**
- Update `InteractionPage.stories.svelte`:
  - Remove `exchangeHost` and `challenge` from `variables` objects
  - Keep only workflow-specific variables
- Update `WalletSelector.stories.svelte`:
  - Verify no base variables needed (should already be correct)
- Update `ExchangeStatusPoll.stories.svelte`:
  - Verify no base variables needed (should already be correct)
- Search for other story files that might use these functions
- Ensure all stories compile and render correctly

## Phase 4: Test and Validation

**Description:** Verify all changes work correctly and fix any issues.

**Success Criteria:**
- All code compiles without errors
- All Storybook stories work correctly
- No type errors in any files
- Functions work as expected

**Implementation Notes:**
- Run TypeScript compiler to check for type errors:
  - `cd dcc/dcc-transaction-service && pnpm build`
- Check Storybook stories compile:
  - Verify no type errors in story files
- Test function behavior:
  - Verify base variables are provided by default
  - Verify base variables can be overridden
  - Verify workflow-specific variables work correctly
- Fix any issues found
- Ensure code is clean and readable

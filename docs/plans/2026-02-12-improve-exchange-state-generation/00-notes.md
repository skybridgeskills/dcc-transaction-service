# Notes: Improve Exchange State Generation

## Analysis

When creating exchange data in Storybook stories using functions like `createStorybookVerifyExchange`, users must provide all required `BaseVariables` fields (`exchangeHost`, `challenge`) even though these functions should provide defaults.

**Current Issue:**
- `createStorybookVerifyExchange({ variables: { vprContext: [...] } })` causes TypeScript error
- Error: Missing `exchangeHost` and `challenge` from `BaseVariables`
- Functions already merge base variables, but TypeScript types don't reflect this

**Root Cause:**
- Type definition: `overrides: Partial<App.ExchangeDetailVerify> = {}`
- When `variables` is provided, TypeScript expects full `App.ExchangeDetailVerify['variables']` type
- This includes required `BaseVariables` fields even though function provides defaults

**Current Implementation:**
- `createStorybookVerifyExchange` already defines `baseVariables` with defaults
- Merges `baseVariables` with `overrides.variables`
- But type system doesn't know base variables are provided

## Questions

### Q1: How should we structure the type definitions for the overrides parameter?

**Context:** The functions need to accept partial variables that exclude base variables (since they're provided by default), while still allowing override of base variables if needed.

**Answer:** Use `Omit` to exclude base variables from required fields. Create a type that:
- Uses `Omit<VariablesType, keyof BaseVariables>` to exclude base variables from required fields
- Makes base variables optional in the override type
- Allows override of base variables if explicitly provided
- Maintains type safety for workflow-specific variables

### Q2: Should base variables be overridable or always use defaults?

**Context:** Functions currently merge base variables with overrides, allowing override. Should we maintain this behavior or enforce defaults?

**Answer:** Allow override of base variables (maintain current behavior). Users can override `exchangeHost` or `challenge` if needed, but shouldn't be required to provide them. Don't worry about heavy documentation.

### Q3: Should we update all three functions (claim, didAuth, verify) or focus on verify?

**Context:** The error is occurring in verify exchange creation, but similar issues may exist for claim and didAuth.

**Answer:** Update all three functions (`createStorybookClaimExchange`, `createStorybookDidAuthExchange`, `createStorybookVerifyExchange`) and also update `createStorybookExchangeData` for consistency. This ensures all Storybook helpers work the same way.

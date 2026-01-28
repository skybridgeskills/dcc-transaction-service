# Phase 02c: Refactor Exchange Service and Auth Service

## Overview

This phase consolidates backend code related to exchanges into a proper Exchange Service and refactors authentication into an Auth Service. The goal is to create well-defined service interfaces that encapsulate business logic and use the app context's service dependencies.

## Objectives

1. **Expand Exchange Service**: Transform the minimal exchange service interface into a comprehensive service that handles all VCALM exchange business logic
2. **Refactor Auth Service**: Convert auth utilities into a proper Auth Service that uses Config Service
3. **Consolidate Exchange Code**: Move all exchange-related code into the services directory
4. **Clean Up Legacy Code**: Remove deprecated files and consolidate batch creation code

## Implementation Plan

### 1. Expand Exchange Service Interface

**File**: `src/lib/services/exchange-service.ts`

Update the `ExchangeService` interface to include all business logic methods:

```typescript
export interface ExchangeService {
  // Existing methods
  getExchangeById(exchangeId: string): Promise<App.ExchangeDetailBase>
  getExchangeData(
    exchangeId: string,
    workflowId: string
  ): Promise<App.ExchangeDetailBase>
  saveExchange(data: App.ExchangeDetailBase): Promise<boolean>
  clearExchanges(): Promise<void>

  // New business logic methods
  createExchange(
    input: App.ExchangeCreateInput,
    config: App.Config,
    workflow: App.Workflow
  ): Promise<App.ExchangeDetailBase>
  createExchangeBatch(
    input: App.ExchangeBatch,
    config: App.Config,
    workflow: App.Workflow
  ): Promise<App.ExchangeDetailBase[]>
  getExchangeProtocols(
    exchange: App.ExchangeDetailBase
  ): Promise<App.ExchangeProtocols>
  participateInExchange(
    data: any,
    exchange: App.ExchangeDetailBase,
    workflow: App.Workflow,
    config: App.Config
  ): Promise<any>
  getExchangeState(
    exchangeId: string,
    workflowId: string
  ): Promise<App.ExchangeDetailBase>
}
```

### 2. Implement Exchange Service

**File**: `src/lib/services/exchange-service.ts` (update implementation class)

Results in a `RealExchangeService` class that:

- Uses `keyValueStore` from app context (via `getApp()`)
- Imports workflow-specific functions from `workflows/didAuthWorkflow.ts`, `workflows/claimWorkflow.ts`, `workflows/verifyWorkflow.ts`
- Imports `verifyDIDAuth` from `didAuth.ts` for DID authentication verification
- Implements all interface methods by consolidating logic from:
  - `src/lib/exchanges/exchange-manager.ts` (getExchangeById, getExchangeData, saveExchange, clearKeyv)
  - `src/exchanges.ts` (createExchangeBatch, createExchangeVcapi, participateInExchange, getProtocols)
  - Protocol generation logic

**Key Implementation Details**:

- `createExchange`: Handles single exchange creation (consolidates `createExchangeVcapi` logic)
- `createExchangeBatch`: Handles batch creation (moves from `exchanges.ts`)
- `getExchangeProtocols`: Generates protocol objects (consolidates `getProtocols` function)
- `participateInExchange`: Handles exchange participation (moves from `exchanges.ts`)
- All methods should throw `HTTPException` for error cases
- Use `getApp().keyValueStore` for storage operations

### 3. Update App Context Types

**File**: `src/lib/app/app-types.ts`

Ensure `ExchangeService` is properly typed in `AppContext`:

- Should have `exchangeService?: ExchangeService` (interface type, not implementation)

### 4. Update App Providers

**File**: `src/lib/app/app-providers.ts`

Update `provideAppContext` to:

- Import `RealExchangeService` from `../services/exchange-service.js` (not from exchanges directory)
- Ensure exchange service initialization depends on keyValueStore being available
- The service should be initialized after keyValueStore is set up

### 5. Create Auth Service

**File**: `src/lib/services/auth-service.ts`

Create new `AuthService` interface and implementation:

```typescript
export interface AuthService {
  getTenant(options: {
    tenantName?: string
    tenantToken?: string
  }): Promise<App.Tenant | undefined>
  authenticateTenant(tenantToken: string): Promise<App.Tenant | undefined>
}
```

**Implementation**:

- `AuthService` class that uses `configService` from app context
- Move logic from `src/lib/auth/auth.ts` into the service implementation
- Use `getApp().configService.getConfig()` to access tenant configuration
- Methods should return `undefined` when authentication is disabled or tenant not found

### 6. Update App Context for Auth Service

**File**: `src/lib/app/app-types.ts`

Add `authService?: AuthService` to `AppContext` interface

**File**: `src/lib/app/app-providers.ts`

Add auth service initialization:

- Create `AuthService` instance
- Initialize after configService is available

### 7. Update Route Handlers to Use Services

Update all route handlers to use the new services:

**Files to update**:

- `src/routes/exchange/+server.ts`: Use `exchangeService.createExchangeBatch()`
- `src/routes/workflows/[workflowId]/exchanges/+server.ts`: Use `exchangeService.createExchange()`
- `src/routes/workflows/[workflowId]/exchanges/[exchangeId]/+server.ts`: Use `exchangeService.participateInExchange()` and `exchangeService.getExchangeState()`
- `src/routes/workflows/[workflowId]/exchanges/[exchangeId]/protocols/+server.ts`: Use `exchangeService.getExchangeProtocols()`
- `src/routes/interactions/[exchangeId]/+server.ts`: Use `exchangeService.getExchangeProtocols()`

**Migration Pattern**:

- Replace direct imports from `exchanges.ts` with `locals.ctx.exchangeService`
- Replace direct imports from `auth.ts` or `lib/auth/auth.ts` with `locals.ctx.authService`
- Update method calls to use service methods

### 8. Move Batch Creation Helper

**Option A**: Move `createExchangeBatch` logic into `src/routes/exchange/+server.ts` as a local helper function

**Option B**: Create `src/routes/exchange/exchange-helpers.ts` with batch creation logic

**Decision**: Use Option B to keep route handlers clean. The helper should:

- Accept the same parameters as current `createExchangeBatch`
- Use `exchangeService.createExchange()` internally for each item in the batch
- Return wallet queries array

### 9. Delete Deprecated Files

Remove these files after migration:

- `src/lib/exchanges/exchange-manager.ts` (functionality moved to ExchangeService)
- `src/lib/exchanges/exchange-service.ts` (replaced by RealExchangeService implementation in services directory)
- `src/auth.ts` (deprecated re-export, functionality moved to AuthService)
- `src/exchanges.ts` (functionality moved to RealExchangeService, except batch helper which moves to route helpers)

### 10. Update Tests

**Files to update**:

- `src/lib/auth/auth.test.ts`: Rename to `src/lib/services/auth-service.test.ts` and update to test `AuthService` interface
- Update all route tests that import from `exchanges.ts` or `auth.ts`
- Create `src/lib/services/exchange-service.test.ts` with tests for RealExchangeService

**Test Updates**:

- Mock services using `provideAppContext` with fake services
- Update imports to use new service locations
- Ensure tests verify service interface usage, not implementation details

### 11. Update Imports Across Codebase

Search and update all imports:

- `from './exchanges.js'` → use `exchangeService` from app context
- `from './auth.js'` → use `authService` from app context
- `from './lib/auth/auth.js'` → use `authService` from app context
- `from './lib/exchanges/exchange-manager.js'` → remove (functionality in service)
- `from './lib/exchanges/exchange-service.js'` → `from './lib/services/exchange-service.js'`

## Files to Create

1. `src/lib/services/auth-service.ts` - AuthService interface and implementation
2. `src/lib/services/auth-service.test.ts` - AuthService tests
3. `src/lib/services/exchange-service.ts` - Expanded ExchangeService interface and RealExchangeService implementation (update existing interface file)
4. `src/lib/services/exchange-service.test.ts` - RealExchangeService tests
5. `src/routes/exchange/exchange-helpers.ts` - Batch creation helper (if using Option B)

## Files to Modify

1. `src/lib/services/exchange-service.ts` - Expand interface and add RealExchangeService implementation
2. `src/lib/app/app-types.ts` - Add authService to AppContext
3. `src/lib/app/app-providers.ts` - Initialize authService and update RealExchangeService import (from services directory, not exchanges directory)
4. `src/routes/exchange/+server.ts` - Use exchangeService and move/import batch helper
5. `src/routes/workflows/[workflowId]/exchanges/+server.ts` - Use exchangeService
6. `src/routes/workflows/[workflowId]/exchanges/[exchangeId]/+server.ts` - Use exchangeService
7. `src/routes/workflows/[workflowId]/exchanges/[exchangeId]/protocols/+server.ts` - Use exchangeService
8. `src/routes/interactions/[exchangeId]/+server.ts` - Use exchangeService
9. All test files that import from deprecated locations

## Files to Delete

1. `src/lib/exchanges/exchange-manager.ts`
2. `src/lib/exchanges/exchange-service.ts`
3. `src/auth.ts`
4. `src/exchanges.ts`

## Verification Steps

1. All tests pass
2. No imports from deprecated files (`exchanges.ts`, `auth.ts`, `exchange-manager.ts`)
3. Exchange service methods are used via app context (`locals.ctx.exchangeService`)
4. Auth service methods are used via app context (`locals.ctx.authService`)
5. Service initialization in `app-providers.ts` follows dependency order (configService → authService, keyValueStore → exchangeService)
6. All route handlers use services instead of direct function imports
7. Batch creation code is co-located with route that uses it

## Dependencies

- Exchange Service depends on: KeyValueStoreService (from app context)
- Exchange Service imports: workflow functions from `workflows/` directory, `verifyDIDAuth` from `didAuth.ts`
- Auth Service depends on: ConfigService (from app context)
- Both services use `getApp()` to access app context

## Notes

- The `verifyDIDAuth` function in `didAuth.ts` is imported by exchange service when needed for DID auth workflow participation
- Workflow-specific functions (`createExchangeDidAuth`, `participateInDidAuthExchange`, etc.) remain in workflow files and are imported by exchange service
- Protocol generation logic (`getLcwProtocol`, etc.) should be imported by exchange service
- The exchange service acts as an orchestrator that coordinates workflow functions, storage, and protocol generation

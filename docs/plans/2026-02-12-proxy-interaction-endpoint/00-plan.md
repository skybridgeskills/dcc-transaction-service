# Plan: Proxy Interaction Endpoint in Tenant-Home

## Overview

Create a proxy endpoint in tenant-home that forwards GET requests to dcc-transaction-service's `/interactions/[exchangeId]` endpoint. This allows tenant-home to serve the interaction page HTML while maintaining the reverse proxy architecture.

**Success Criteria:**
- New GET endpoint at `/interactions/[exchangeId]` in tenant-home
- Endpoint proxies requests to dcc-transaction-service `/interactions/[exchangeId]`
- All request headers forwarded, especially `Accept` header for content negotiation
- Transaction service response (status, headers, body) passed through as-is
- Request logging similar to existing exchange endpoint
- HTML and JSON responses handled correctly
- Error handling preserves transaction service error responses

## Phases

1. Create the interactions route structure in tenant-home
2. Implement GET handler with proxy logic
3. Add request logging
4. Test and validate

## Design

### File Structure

```
skybridgeskills-monorepo/sbs/apps/tenant-home/src/routes/(public)/
└── interactions/
    └── [exchangeId]/
        └── +server.ts              # NEW - Proxy endpoint
```

### Architecture

**Request Flow:**
```
Client → tenant-home GET /interactions/[exchangeId]
  ↓
tenant-home forwards request to dcc-transaction-service
  ↓
dcc-transaction-service handles content negotiation
  ↓
Response (HTML or redirect) returned to tenant-home
  ↓
tenant-home passes response through to client
```

**Key Components:**
- GET handler that accepts `exchangeId` from route params
- Fetch to dcc-transaction-service with forwarded headers
- Response proxying (HTML text or JSON)
- Request logging using `appLogger()`

**Content Negotiation:**
- Transaction service handles content negotiation based on `Accept` header
- If JSON requested → transaction service redirects to protocols endpoint
- If HTML requested → transaction service returns HTML page
- Tenant-home simply forwards the response

## Phase 1: Create the Interactions Route Structure

**Description:** Create the route directory structure and basic server endpoint file.

**Success Criteria:**
- Route directory created at `src/routes/(public)/interactions/[exchangeId]/`
- `+server.ts` file created with basic structure
- File follows tenant-home conventions

**Implementation Notes:**
- Create directory: `skybridgeskills-monorepo/sbs/apps/tenant-home/src/routes/(public)/interactions/[exchangeId]/`
- Create `+server.ts` file
- Import necessary types and utilities:
  - `appContext` from `@repo/lib-backend/core/app-context/app-context`
  - `appLogger` from `@repo/lib-backend/core/logging/logger-service`
  - `error` from `@sveltejs/kit`
- Export empty `GET` handler function stub

## Phase 2: Implement GET Handler with Proxy Logic

**Description:** Implement the GET handler that proxies requests to dcc-transaction-service.

**Success Criteria:**
- GET handler extracts `exchangeId` from params
- Handler constructs transaction service URL using `TRANSACTION_SERVICE_URL`
- All request headers forwarded to transaction service
- Response from transaction service returned to client
- HTML responses handled correctly (text, not JSON)
- Status codes and headers preserved

**Implementation Notes:**
- Extract `exchangeId` from `params`
- Get `TRANSACTION_SERVICE_URL` from `appContext().appEnv`
- Build target URL: `${TRANSACTION_SERVICE_URL}/interactions/${exchangeId}`
- Forward all headers from incoming request:
  ```ts
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    headers.set(key, value);
  });
  ```
- Make fetch request:
  ```ts
  const response = await fetch(targetUrl, {
    method: 'GET',
    headers,
  });
  ```
- Handle response based on content type:
  - If HTML (`text/html`): Get response as text and return with proper headers
  - If JSON (`application/json`): Get response as JSON (for error cases)
  - If redirect: Forward redirect response
- Return Response with:
  - Status code from transaction service
  - Headers from transaction service (may need to filter some)
  - Body from transaction service
- Use `response.text()` for HTML, `response.json()` for JSON errors
- Return using SvelteKit's Response or `error()` helper

**Response Handling:**
- Check `Content-Type` header to determine response type
- For HTML: `const html = await response.text(); return new Response(html, { status: response.status, headers: response.headers })`
- For JSON errors: `const json = await response.json(); return json(json, { status: response.status })`
- For redirects: Transaction service may return redirects (302), forward these appropriately

## Phase 3: Add Request Logging

**Description:** Add logging similar to the existing exchange endpoint.

**Success Criteria:**
- Requests logged with exchangeId
- Errors logged appropriately
- Logging follows existing patterns

**Implementation Notes:**
- Log request start:
  ```ts
  appLogger().info({ exchangeId }, 'Proxying interaction request');
  ```
- Log successful responses (optional, may be verbose):
  ```ts
  appLogger().info({ exchangeId, status: response.status }, 'Interaction request proxied successfully');
  ```
- Log errors:
  ```ts
  appLogger().error({ error, exchangeId }, 'Failed to proxy interaction request');
  ```
- Follow existing logging patterns from `workflows/[workflowId]/exchanges/[exchangeId]/+server.ts`
- Consider logging level (info vs debug) based on existing patterns

## Phase 4: Error Handling

**Description:** Handle errors from transaction service and network errors appropriately.

**Success Criteria:**
- Network errors caught and logged
- Transaction service errors (4xx, 5xx) passed through with original status
- Error responses preserve transaction service error format
- No unhandled exceptions

**Implementation Notes:**
- Wrap fetch in try-catch
- Handle network errors:
  ```ts
  catch (e) {
    appLogger().error({ error: e, exchangeId }, 'Network error proxying interaction request');
    throw error(502, { message: 'Failed to connect to transaction service' });
  }
  ```
- Handle transaction service errors:
  - If `response.ok === false`, still return the response body
  - Transaction service may return HTML error pages or JSON error responses
  - Preserve status code and error format
- For 404 errors: Transaction service returns 404, pass through
- For 500 errors: Transaction service returns 500, pass through
- Log errors but don't modify response format

## Phase 5: Test and Validate

**Description:** Test the endpoint with various scenarios.

**Success Criteria:**
- Endpoint responds correctly for valid exchangeId
- HTML responses render correctly
- JSON requests handled (transaction service redirects)
- Error cases handled appropriately
- Headers forwarded correctly
- Logging works as expected

**Implementation Notes:**
- Test with valid exchangeId:
  - Request with `Accept: text/html` → should return HTML
  - Request with `Accept: application/json` → should follow redirect or return JSON
- Test with invalid exchangeId:
  - Should return 404 from transaction service
- Test error scenarios:
  - Network errors (transaction service down)
  - Invalid transaction service URL
- Verify headers are forwarded:
  - Check that `Accept` header reaches transaction service
  - Verify other headers (User-Agent, etc.) are forwarded
- Check logs:
  - Verify requests are logged
  - Verify errors are logged appropriately
- Manual testing:
  - Start tenant-home locally
  - Start dcc-transaction-service locally
  - Make requests to `/interactions/[exchangeId]`
  - Verify HTML page loads correctly
  - Verify content negotiation works

## Implementation Details

### Response Type Handling

Since the transaction service can return:
1. HTML pages (for `Accept: text/html`)
2. JSON responses (for errors or `Accept: application/json`)
3. Redirects (302 for JSON requests)

The handler should:
- Check response `Content-Type` header
- Use appropriate method to read body (`text()` vs `json()`)
- Preserve all response headers
- Handle redirects if transaction service returns them

### Header Forwarding

Forward all headers except potentially:
- `host` (should be transaction service host)
- `connection` (connection management)
- `content-length` (may be recalculated)

In practice, forwarding all headers and letting transaction service handle them is safest.

### URL Construction

Use `appEnv.TRANSACTION_SERVICE_URL` from app context, same pattern as existing exchange endpoint:
```ts
const { appEnv } = appContext();
const targetUrl = `${appEnv.TRANSACTION_SERVICE_URL}/interactions/${exchangeId}`;
```

## Notes

- This is a simple pass-through proxy - transaction service handles all business logic
- No authentication/authorization needed at tenant-home level (transaction service handles it)
- Response format depends on transaction service - tenant-home just forwards it
- Content negotiation is handled by transaction service, not tenant-home
- This endpoint is simpler than the POST exchange endpoint (no event creation, no credential updates)

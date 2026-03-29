# Section 01 — nocodb-client.js: Shared REST Client

## Overview

This section creates two new files:

- `ryan_cole/insiderbuying-site/n8n/code/insiderbuying/nocodb-client.js` — the shared NocoDB REST client used by all migrated workflow files
- `ryan_cole/insiderbuying-site/tests/insiderbuying/nocodb-client.test.js` — Jest test suite for the client

This section has **no dependencies** and must be completed before any other migration section (02, 03, 04, 05).

---

## Background

The EarlyInsider content pipeline is migrating from Airtable to NocoDB to eliminate the 1,200-record free-tier limit. NocoDB is already running on the same VPS at `http://localhost:8080` and has its PostgreSQL schema in place (tables and column names match existing Airtable field names exactly — do not change the schema).

Currently, all 24 workflow files construct Airtable URLs and auth headers inline with no shared abstraction. This migration introduces `nocodb-client.js` as the single module that knows NocoDB's URL scheme, auth header (`xc-token`), and response shapes. All 9 migrated files will delegate HTTP to this module.

---

## Key API Differences (Airtable → NocoDB)

Keep these translation rules in mind throughout implementation:

| Concern | Airtable | NocoDB |
|---|---|---|
| Base URL | `https://api.airtable.com/v0/{base}/{table}` | `http://localhost:8080/api/v1/db/data/noco/{projectId}/{tableName}` |
| Bulk URL | N/A | `/api/v1/db/data/bulk/noco/{projectId}/{tableName}/` (note `/bulk/` in path and trailing slash) |
| Auth header | `Authorization: Bearer {key}` | `xc-token: {token}` |
| Request body | `{ fields: { name: "x" } }` (wrapped) | `{ name: "x" }` (flat — no wrapper) |
| List response | `{ records: [{ id: "recXXX", fields: {...} }], offset: "cursor" }` | `{ list: [{ Id: 1, ...fields }], pageInfo: { isLastPage: true } }` |
| Record ID | string `recXXXXXXXXXXXXXX` | integer, accessed as `record.Id` (capital I) |
| Filter syntax | Airtable formula: `filterByFormula=AND({f}='x')` | NocoDB where: `(f,eq,x)~and(f2,gt,0)` |
| Sort | `sort[0][field]=x&sort[0][direction]=desc` | `sort=-x` (leading `-` = descending) |
| Pagination | cursor string `data.offset` | integer offset + `pageInfo.isLastPage` boolean |
| Count | No dedicated endpoint | GET `.../{table}/count?where=...` returns `{ count: N }` |

---

## Class Design

`NocoDB` is a class with:

- **Constructor**: `(baseUrl, token, projectId, fetchFn)` — stores all four; does not call any network
- **7 public methods**: `list`, `get`, `create`, `update`, `delete`, `bulkCreate`, `count`
- **Private helper**: `_req(method, path, opts)` — sets `xc-token` header, serializes JSON bodies, handles retries, throws descriptive errors on non-2xx

### Constructor signature

```js
class NocoDB {
  constructor(baseUrl, token, projectId, fetchFn) { ... }
}
```

### Public method signatures

```js
// GET list — returns { list, pageInfo }
async list(table, opts = {})
// opts keys: where (string), limit (number), offset (number), sort (string), fields (comma-separated string)

// GET single record — returns flat record object, or null if 404 (do NOT throw on 404)
async get(table, id)

// POST flat object — returns created record with integer Id
async create(table, data)

// PATCH partial object — returns updated record
// IMPORTANT: callers must pass ONLY fields to change; do not spread a full record (system fields like Id, created_at will cause Postgres errors)
async update(table, id, data)

// DELETE — returns success response
async delete(table, id)

// POST array to bulk endpoint — chunks into batches of 200 sequentially, returns flattened array of created records
async bulkCreate(table, records)

// GET count — returns integer (unwrapped from { count: N })
async count(table, where)
```

### `_req()` behavior

- Sets `Content-Type: application/json` and `xc-token: {token}` on every request
- Throws a descriptive error on non-2xx responses. Error message format: `"NocoDB PATCH /api/v1/db/data/noco/{proj}/{table}/42 => 500: Internal Server Error"`. Include method, full URL path, status code, and response body text. **Do NOT include the `xc-token` value in error messages.**
- Retries up to 3 times on 500 and 503 responses. Backoff delays: 100ms, 300ms, 1000ms (before each retry attempt respectively).
- Does NOT retry on 4xx errors — these indicate a logic error and must surface immediately.
- The 404 case for `get()` is special: `_req` throws, but `get()` catches the 404 and returns `null`.

### `bulkCreate()` chunking

The bulk endpoint accepts arrays. Chunk records into batches of 200 and POST each batch sequentially. Return a single flattened array of all created records. This prevents Postgres parameter-limit errors on large inserts.

The bulk endpoint URL differs from the single-record URL: `/api/v1/db/data/bulk/noco/{projectId}/{tableName}/` (with `/bulk/` in the path and a trailing slash).

### Encoding note for callers

When callers build `where` strings with dynamic values (insider names, tickers, domains), they must pass values through `encodeURIComponent()`. Names containing commas, parentheses, or special characters will break NocoDB's `(field,op,value)` parser if not encoded.

---

## How Callers Instantiate the Client

In each migrated file's n8n entry block:

```js
const nocodb = new NocoDB(
  env.NOCODB_BASE_URL,
  env.NOCODB_API_TOKEN,
  env.NOCODB_PROJECT_ID,
  (url, opts) => fetch(url, opts)
);
const helpers = { fetchFn: (url, opts) => fetch(url, opts), nocodb, _sleep, ... };
```

Functions that need NocoDB receive it as `opts.nocodb`. This mirrors how `opts.fetchFn` is currently passed across the codebase.

---

## Pagination Guidance

All paginated `list()` calls across the codebase should include `sort: '-Id'` to ensure deterministic ordering and prevent records from being skipped or duplicated if rows are inserted during the loop.

The pagination loop pattern:

```js
let offset = 0;
const limit = 100;
let pageInfo = { isLastPage: false };
while (!pageInfo.isLastPage) {
  const result = await nocodb.list('TableName', { where: '...', sort: '-Id', limit, offset });
  pageInfo = result.pageInfo;
  // process result.list
  offset += limit;
}
```

---

## Tests — Write These First

Create `ryan_cole/insiderbuying-site/tests/insiderbuying/nocodb-client.test.js`.

Use the same testing patterns as all other test files in the repo:
- `makeFetch(response, ok, status)` — creates a `jest.fn()` that resolves once
- `makeFetchSeq(...calls)` — creates a sequential mock for multi-call flows
- Instantiate the class with `new NocoDB('http://localhost:8080', 'test-token', 'proj123', fetchFn)`
- Assert on `fetchFn` call count, URL, and request body via `JSON.parse(call[1].body)` and `call[1].headers`

### Constructor
- Stores `baseUrl`, `token`, `projectId`, `fetchFn` as accessible properties

### `list(table, opts)`
- Calls GET with correct URL path `/api/v1/db/data/noco/proj123/{table}`
- Passes `where`, `limit`, `offset`, `sort`, `fields` as query params when provided
- Omits query params when opts is empty `{}`
- Returns the `{ list, pageInfo }` shape from mock response
- Handles empty list `{ list: [], pageInfo: { isLastPage: true } }`
- Includes `xc-token` header in every request

### `get(table, id)`
- Calls GET with URL `.../tableName/42`
- Returns flat record object on success
- Returns `null` when server responds 404 (does NOT throw)
- Throws descriptive error on 500

### `create(table, data)`
- Calls POST with flat JSON body (no `{ fields: {} }` wrapper)
- Returns created record containing `Id`
- Throws with method + URL + status on non-2xx

### `update(table, id, data)`
- Calls PATCH to `.../tableName/42` with partial data only
- Does not include `Id` or system fields in request if caller did not pass them

### `delete(table, id)`
- Calls DELETE to `.../tableName/42`
- Returns success response

### `bulkCreate(table, records)`
- Calls POST to bulk endpoint `/api/v1/db/data/bulk/noco/proj123/{table}/`
- Sends full array in single call when records count is <= 200
- Chunks into two POST calls when records count is > 200 (first batch 200, second batch remainder)
- Returns flattened array of all created records

### `count(table, where)`
- Calls GET to `.../tableName/count`
- Passes `where` as query param when provided
- Returns the integer from `response.count` (unwrapped — not the raw `{ count: N }` object)
- Returns `0` when the where filter matches nothing (server returns `{ count: 0 }`)

### Error handling / `_req()` retry
- Retries on 500: use `makeFetchSeq` with responses [500, 500, 200] — function should succeed on third call
- Does NOT retry on 404 — throws immediately on first 404 response
- Does NOT retry on 400 — throws immediately on first 400 response
- Error message includes HTTP method, URL path, status code, and response body text
- Error message does NOT contain the `xc-token` value

---

## Implementation Checklist

1. Create `nocodb-client.test.js` and write all tests listed above — confirm they FAIL before implementation
2. Create `nocodb-client.js` with `NocoDB` class
3. Implement constructor storing `baseUrl`, `token`, `projectId`, `fetchFn`
4. Implement `_req(method, path, opts)` — auth header, JSON body, retry backoff, descriptive errors
5. Implement `list()` — build query string from opts, return `{ list, pageInfo }`
6. Implement `get()` — catch 404 and return `null` instead of throwing
7. Implement `create()` — flat body POST, return created record
8. Implement `update()` — PATCH with only provided fields
9. Implement `delete()`
10. Implement `bulkCreate()` — chunk to 200, sequential POST, flatten results
11. Implement `count()` — unwrap integer from `{ count: N }`
12. Run `npm test` — all `nocodb-client.test.js` tests should pass
13. Verify no other test files broke

## Definition of Done for This Section

- `nocodb-client.test.js` passes with coverage on all 7 public methods and the error/retry path
- `NocoDB` class is importable via `require('./nocodb-client')` or equivalent
- Sections 02, 03, and 04 can proceed

---

## Implementation Notes (Actual)

**Files created:**
- `n8n/code/insiderbuying/nocodb-client.js`
- `tests/insiderbuying/nocodb-client.test.js`

**Tests:** 36 pass (31 planned + 5 added from code review)

**Deviations from plan (code review fixes applied):**
1. `Content-Type` header only set when body is present (GET/DELETE omit it — RFC correctness)
2. Thrown errors have `err.statusCode` property — `get()` checks `err.statusCode === 404` instead of string-contains matching
3. `bulkCreate()` throws when NocoDB returns non-array response (instead of silently dropping)
4. `count()` throws when response is missing `count` key (instead of returning `undefined`)
5. JSDoc: `where` double-encoding warning + `bulkCreate([])` no-op documented

**Coverage additions:**
- `bulkCreate` non-array response → throws
- `count()` missing key → throws
- Retry: 4× 500 exhausts all attempts
- `bulkCreate` with exactly 200 records (boundary)
- `get(0)` with falsy-but-valid ID

# Research: 08-nocodb-migration

## 1. Codebase Analysis

### File Locations

Actual files are in:
```
ryan_cole/insiderbuying-site/n8n/code/insiderbuying/
```
NOT `n8n/code/insiderbuying/`. The spec path `n8n/code/insiderbuying/nocodb-client.js` refers to this directory. All 24 .js files are CommonJS modules. Tests are in `ryan_cole/insiderbuying-site/tests/insiderbuying/*.test.js`.

### Critical Architectural Finding: Dependency Injection, Not require('https')

The existing code does NOT call `require('https')` directly. All HTTP calls go through an injected `fetchFn`:

```js
async function createAirtableRecord(filing, opts) {
  const { fetchFn, env } = opts;
  const res = await fetchFn(url, { method: 'POST', headers: {...}, body: JSON.stringify({fields}) });
}
```

The n8n entry block injects the global `fetch`:
```js
const helpers = {
  fetchFn: (url, opts) => fetch(url, opts),
  _sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
};
```

**Implication**: `nocodb-client.js` must follow this same pattern — accept `fetchFn` as a constructor argument. Tests mock it with `jest.fn()` — no nock needed.

### Airtable API Usage Patterns (what we're replacing)

**URL construction:**
```js
const url = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.TABLE_ID}`;
// Single record:
const url = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.TABLE_ID}/${recordId}`;
```

**Auth:**
```js
headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' }
```

**Body structure — WRAPPED in `{fields: {...}}`:**
```js
body: JSON.stringify({ fields: { ticker, company_name, status: 'processed', ... } })
```

**Filter syntax (Airtable formula strings):**
```js
`IS_AFTER({filing_date}, '${sevenDaysAgo}')`
`{name}='${monitorStateName}'`
`AND({transaction_type}='cluster',{cluster_id}='${clusterId}')`
```

**Pagination:**
```js
const params = new URLSearchParams({ filterByFormula: formula });
if (offset) params.set('offset', offset);
// Response: data.records[], data.offset (cursor-based pagination)
```

**Response shape:**
```js
const data = await res.json();
return data.id; // Airtable string recXXX
// List: data.records[i].id + data.records[i].fields.fieldName
```

### Environment Variables Currently Used

```js
AIRTABLE_API_KEY       // Bearer token
AIRTABLE_BASE_ID       // appXXX format
INSIDER_ALERTS_TABLE_ID
MONITOR_STATE_TABLE_ID
SUPABASE_URL           // Keep — NOT being migrated
SUPABASE_SERVICE_ROLE_KEY // Keep — NOT being migrated
```

**After migration, replace with:**
```
NOCODB_API_TOKEN       // xc-token value
NOCODB_BASE_URL        // http://localhost:8080
NOCODB_PROJECT_ID      // NocoDB project identifier
```

### Supabase — NOT Being Migrated

`score-alert.js`, `sec-monitor.js`, and `write-persistence.js` also write to Supabase (`/rest/v1/insider_alerts`). These calls use flat objects and PostgREST syntax. They stay unchanged.

### Test Framework and Patterns

**Framework**: Jest (`testEnvironment: "node"`)

**Mock factory pattern used throughout:**
```js
function makeFetch(response, ok = true, status = 200) {
  return jest.fn().mockResolvedValue({
    ok, status,
    json: async () => response,
    text: async () => JSON.stringify(response),
  });
}

function makeFetchSeq(...calls) {
  const fn = jest.fn();
  calls.forEach(({ response, ok = true, status = 200 }) => {
    fn.mockResolvedValueOnce({ ok, status, json: async () => response, text: async () => JSON.stringify(response) });
  });
  return fn;
}
```

**Base test environment:**
```js
const BASE_ENV = {
  AIRTABLE_API_KEY: 'at-key',
  AIRTABLE_BASE_ID: 'appXXX',
  INSIDER_ALERTS_TABLE_ID: 'tblAlerts',
  MONITOR_STATE_TABLE_ID: 'tblState',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sb-key',
  TELEGRAM_BOT_TOKEN: 'tg-token',
  TELEGRAM_MONITORING_CHAT_ID: '-100123',
};
```

**Call verification:**
```js
expect(fetchFn).toHaveBeenCalledTimes(3);
const body = JSON.parse(fetchFn.mock.calls[0][1].body);
expect(body.fields.dedup_key).toBe(SAMPLE_FILING.dedup_key);
```

**Important**: After migration, tests change `body.fields.xyz` → `body.xyz` (NocoDB flat format).

### No Existing Shared Client

There is no centralized Airtable or Supabase client wrapper. Each function constructs its own URLs and headers inline. `nocodb-client.js` will be the first shared HTTP client in this codebase.

### Key Files for Migration (with what they do in Airtable)

| File | Airtable Operations |
|------|---------------------|
| `write-persistence.js` | create Insider_Alerts, update Monitor_State, create Cluster_Summaries |
| `sec-monitor.js` | read Monitor_State (dedup check), read filings for cluster detect |
| `score-alert.js` | read Insider_History for track record |
| `analyze-alert.js` | lookup + save analysis results |
| `deliver-alert.js` | read Users/eligible, update Alert_Delivery_Log |
| `x-auto-post.js` | read Articles, read/write X_Post_Log |
| `x-engagement.js` | read/write X_Engagement_Log |
| `reddit-monitor.js` | read/write Reddit_Log |
| `send-outreach.js` | read/write Outreach_Prospects |
| `find-prospects.js` | write Outreach_Prospects, dedup filter |

---

## 2. NocoDB REST API v1

### Base URL Pattern

```
http://localhost:8080/api/v1/db/data/noco/{projectId}/{tableName}
```

Auth header: `xc-token: <NOCODB_API_TOKEN>`

### CRUD Endpoints

```
GET    /api/v1/db/data/noco/{proj}/{table}          list
GET    /api/v1/db/data/noco/{proj}/{table}/{id}      get single
POST   /api/v1/db/data/noco/{proj}/{table}           create
PATCH  /api/v1/db/data/noco/{proj}/{table}/{id}      update
DELETE /api/v1/db/data/noco/{proj}/{table}/{id}      delete
GET    /api/v1/db/data/noco/{proj}/{table}/count     count
POST   /api/v1/db/data/bulk/noco/{proj}/{table}/     bulk create
```

### List Query Parameters

| Param | Alias | Purpose |
|-------|-------|---------|
| `where` | `w` | Filter: `(field,op,value)~and(...)` |
| `limit` | `l` | Max rows (default: 10) |
| `offset` | `o` | Pagination offset |
| `sort` | `s` | `fieldName` = ASC, `-fieldName` = DESC |
| `fields` | `f` | Comma-sep column whitelist |

### Filter Operators

```
eq, neq/not, gt, ge/gte, lt, le/lte, is, isnot, in, btw, nbtw, like, nlike, allof, anyof
```

Complex example:
```
where=(Status,eq,active)~and(Amount,gt,100)~or(Priority,eq,high)
```

### Request Body — FLAT (no `{fields:{}}` wrapper)

```js
// Create / Update:
{ "ticker": "AAPL", "status": "processed", "significance_score": 8 }

// Bulk Create:
[{ "ticker": "AAPL" }, { "ticker": "MSFT" }]
```

### Response Shape

**List:**
```json
{
  "list": [{ "Id": 1, "ticker": "AAPL", "status": "processed" }],
  "pageInfo": { "totalRows": 250, "page": 1, "pageSize": 25, "isLastPage": false }
}
```

**Single record:**
```json
{ "Id": 1, "ticker": "AAPL", "status": "processed" }
```

**Count:**
```json
{ "count": 42 }
```

### Record IDs

NocoDB uses **integer IDs** (1, 2, 3...), not Airtable's `recXXXXXXXXXXXXXX` strings. The field name is `Id` (capital I).

### Pagination (offset-based)

```js
let offset = 0;
const limit = 100;
let all = [];
while (true) {
  const page = await fetch(`${base}?limit=${limit}&offset=${offset}`, { headers });
  const { list, pageInfo } = await page.json();
  all = all.concat(list);
  if (pageInfo.isLastPage) break;
  offset += limit;
}
```

### Rate Limiting

Default: 5 req/s, 30s lockout on excess. Self-hosted (localhost) — effectively no limit. `nocodb-client.js` can set rate limit to 0.

---

## 3. Airtable → NocoDB API Translation Table

| Operation | Airtable | NocoDB |
|-----------|----------|--------|
| Base URL | `https://api.airtable.com/v0/{base}/{table}` | `http://localhost:8080/api/v1/db/data/noco/{proj}/{table}` |
| Auth header | `Authorization: Bearer {AIRTABLE_API_KEY}` | `xc-token: {NOCODB_API_TOKEN}` |
| Create body | `{ "fields": { "name": "x" } }` | `{ "name": "x" }` |
| Update body | `{ "fields": { "name": "y" } }` | `{ "name": "y" }` |
| List response | `data.records[i].id` + `data.records[i].fields.x` | `data.list[i].Id` + `data.list[i].x` |
| Record ID format | `recXXXXXXXXXXXXXX` (string) | Integer |
| Filter | `filterByFormula=AND({f}='x',{f2}>0)` | `where=(f,eq,x)~and(f2,gt,0)` |
| Sort | `sort[0][field]=x&sort[0][direction]=asc` | `sort=x` or `sort=-x` |
| Pagination cursor | `data.offset` (cursor string) | `pageInfo.isLastPage` (boolean) + integer offset |
| Count | No dedicated endpoint | `GET .../count?where=(...)` |

### Filter Formula Translation

| Airtable | NocoDB |
|----------|--------|
| `{Status} = 'active'` | `(Status,eq,active)` |
| `{Amount} > 100` | `(Amount,gt,100)` |
| `NOT({Status} = 'x')` | `(Status,neq,x)` |
| `AND({A}='x', {B}='y')` | `(A,eq,x)~and(B,eq,y)` |
| `OR({A}='x', {B}='y')` | `(A,eq,x)~or(B,eq,y)` |
| `IS_AFTER({date}, '...')` | `(date,gt,...)` |
| `{Field} = BLANK()` | `(Field,is,null)` |
| `FIND('tag', {Tags})` | `(Tags,like,%tag%)` |

---

## 4. HTTP Client Pattern in n8n Context

### In n8n Code Nodes

Since `fetchFn` is already injected at the entry point, `nocodb-client.js` should accept `fetchFn` in its constructor — same pattern as the existing files.

```js
class NocoDB {
  constructor(baseUrl, token, projectId, fetchFn) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.projectId = projectId;
    this.fetchFn = fetchFn;
  }

  _url(table, id = '', extra = '') {
    const base = `${this.baseUrl}/api/v1/db/data/noco/${this.projectId}/${table}`;
    return id ? `${base}/${id}${extra}` : `${base}${extra}`;
  }

  async _req(url, method = 'GET', body = null) {
    const opts = {
      method,
      headers: { 'xc-token': this.token, 'Content-Type': 'application/json' },
    };
    if (body !== null) opts.body = JSON.stringify(body);
    const res = await this.fetchFn(url, opts);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`NocoDB ${method} ${url} => ${res.status}: ${text}`);
    }
    return res.json();
  }

  async list(table, opts = {}) { ... }
  async get(table, id) { ... }
  async create(table, data) { ... }
  async update(table, id, data) { ... }
  async delete(table, id) { ... }
  async bulkCreate(table, records) { ... }
  async count(table, where) { ... }
}
```

### In Unit Tests

Same `makeFetch` / `makeFetchSeq` pattern already used:
```js
const nocodb = new NocoDB('http://localhost:8080', 'xc-token', 'proj123', makeFetch({
  list: [{ Id: 1, ticker: 'AAPL' }],
  pageInfo: { isLastPage: true }
}));
```

No nock needed — the injected mock `fetchFn` handles all HTTP interception.

---

## 5. Testing Approach

### Existing Pattern (Keep)

```js
// jest.config.js
module.exports = { testEnvironment: 'node', testMatch: ['**/tests/**/*.test.js'] };

// In test file:
function makeFetch(response, ok = true, status = 200) {
  return jest.fn().mockResolvedValue({
    ok, status,
    json: async () => response,
    text: async () => JSON.stringify(response),
  });
}
```

### Migration Test Changes

After migration, update tests:
1. `BASE_ENV`: remove `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `INSIDER_ALERTS_TABLE_ID`, `MONITOR_STATE_TABLE_ID`. Add `NOCODB_API_TOKEN`, `NOCODB_BASE_URL`, `NOCODB_PROJECT_ID`.
2. Mock responses: use NocoDB shape `{ list: [...], pageInfo: {...} }` instead of `{ records: [...], offset: null }`.
3. Body assertions: `body.ticker` instead of `body.fields.ticker`.
4. URL assertions: `http://localhost:8080/api/v1/db/data/noco/...` instead of `https://api.airtable.com/v0/...`.

### nocodb-client.test.js

Full CRUD coverage:
- `list()` with and without `where`/`limit`/`offset`/`sort`
- `get()` single record
- `create()` flat body
- `update()` partial PATCH
- `delete()`
- `bulkCreate()` array body
- `count()` with filter
- Error handling: non-2xx throws descriptive message

---

## 6. GAP 12.14 Fix (send-outreach.js)

The outreach email prompt currently includes `ourArticle.url` in the email body. Per spec, the first email must have zero links.

Current location (to audit): `send-outreach.js` `buildOutreachPrompt()` or equivalent — remove any `url`, `href`, `http` from the first email template/prompt. The fix is a prompt change, not an architectural change.

---

## Sources

- NocoDB REST API v1 official docs (docs.nocodb.com)
- NocoDB GitHub discussions #1765, #2122 (migration patterns)
- Codebase analysis: `ryan_cole/insiderbuying-site/n8n/code/insiderbuying/*.js`
- Codebase analysis: `ryan_cole/insiderbuying-site/tests/insiderbuying/*.test.js`

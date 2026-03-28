# Complete Spec: 08-nocodb-migration

## Overview

Migrate all n8n workflow code files in `ryan_cole/insiderbuying-site/n8n/code/insiderbuying/` from Airtable REST API (free tier, 1,200 record limit) to NocoDB REST API (self-hosted on same VPS as n8n, localhost, unlimited records, PostgreSQL-backed). Also fixes GAP 12.14: remove URL from first outreach email template.

This is a pure API client substitution — no business logic changes, no table creation, no schema changes. NocoDB schema already exists from unit 01-infrastructure.

---

## Problem Being Solved

- **Immediate**: Airtable free tier hits 1,200 record limit in ~24 days at current SEC filing volume
- **Root**: All 9 n8n workflow files call `api.airtable.com` for persistence; no abstraction layer
- **GAP 12.14**: `send-outreach.js` includes `ourArticle.url` in the first email prompt, violating the zero-link rule for cold outreach

---

## Scope

### Files Being Modified

All in `ryan_cole/insiderbuying-site/n8n/code/insiderbuying/`:

| File | Airtable ops being replaced |
|------|------------------------------|
| `write-persistence.js` | create Insider_Alerts, update Monitor_State, create Cluster_Summaries |
| `sec-monitor.js` | read Monitor_State (dedup), read Monitor_State (cluster state) |
| `score-alert.js` | read Insider_History (track record lookup) — currently in Supabase, migrating to NocoDB |
| `analyze-alert.js` | any Airtable lookups + save analysis result |
| `deliver-alert.js` | read/write Alert_Delivery_Log (Users stay in Supabase) |
| `x-auto-post.js` | read Articles, read/write X_Post_Log |
| `x-engagement.js` | read/write X_Engagement_Log |
| `reddit-monitor.js` | read/write Reddit_Log |
| `send-outreach.js` | read/write Outreach_Prospects + **GAP 12.14 fix** |
| `find-prospects.js` | write Outreach_Prospects, filter by domain (dedup) |

### Files Being Created

- `nocodb-client.js` — shared NocoDB REST helper class (CRUD, filter, sort, paginate, count, bulk)
- `nocodb-client.test.js` — unit tests with 100% coverage on all 8 methods

### Files NOT Changing

- Any Supabase calls (PostgREST `/rest/v1/...`) — EXCEPT `score-alert.js` track record query which migrates to NocoDB `Insider_History`
- All non-HTTP business logic (classifyInsider, buildDedupKey, normalizeInsiderName, etc.)
- All external API calls (SEC EDGAR, Yahoo Finance, Anthropic, Telegram, Financial Datasets)

---

## Architecture Decisions

### 1. `fetchFn` Dependency Injection (not require('https'))

`nocodb-client.js` follows the established DI pattern of all 24 existing files:

```js
class NocoDB {
  constructor(baseUrl, token, projectId, fetchFn) { ... }
}
```

The n8n entry block instantiates once:
```js
const nocodb = new NocoDB(
  env.NOCODB_BASE_URL, env.NOCODB_API_TOKEN, env.NOCODB_PROJECT_ID,
  (url, opts) => fetch(url, opts)
);
const helpers = { ..., nocodb };
```

Functions receive it via `opts.nocodb`. Tests inject `jest.fn()` mocks.

### 2. Column Names Are Identical

NocoDB column names match Airtable field names exactly. No mapping layer needed. Code that previously did `body.fields.ticker` does `body.ticker` — that's the only structural change.

### 3. Supabase Boundary

| Data type | Where it lives | Migration? |
|-----------|---------------|------------|
| Insider Alerts (filings) | NocoDB `Insider_Alerts` | Yes (from Airtable) |
| Monitor State | NocoDB `Monitor_State` | Yes (from Airtable) |
| Cluster Summaries | NocoDB `Cluster_Summaries` | Yes (from Airtable) |
| Track record / history | NocoDB `Insider_History` | Yes (from Supabase!) |
| Alert delivery log | NocoDB `Alert_Delivery_Log` | Yes (from Airtable) |
| Social logs (X, Reddit) | NocoDB `X_Post_Log`, `X_Engagement_Log`, `Reddit_Log` | Yes (from Airtable) |
| Outreach prospects | NocoDB `Outreach_Prospects` | Yes (from Airtable) |
| Articles | NocoDB `Articles` | Yes (from Airtable) |
| Users / subscribers | **Supabase** | NO — auth data stays |
| Cluster sync (writes) | **Supabase** `insider_alerts` | NO — Supabase stays for this |

### 4. GAP 12.14

In `send-outreach.js`, remove all URL/link references from the first outreach email prompt/template. Zero links policy for cold email.

---

## NocoDB Client API

### Constructor

```js
const nocodb = new NocoDB(baseUrl, token, projectId, fetchFn);
// baseUrl = 'http://localhost:8080'
// token   = env.NOCODB_API_TOKEN (xc-token value)
// projectId = env.NOCODB_PROJECT_ID
// fetchFn = injected fetch function
```

### Methods

```js
// List records with optional filter/pagination/sort
await nocodb.list(table, { where, limit, offset, sort, fields })
// Returns: { list: [...], pageInfo: { totalRows, isLastPage } }

// Get single record by ID
await nocodb.get(table, id)
// Returns: { Id, ...fields }

// Create single record (flat body)
await nocodb.create(table, data)
// Returns: { Id, ...fields }

// Update record (partial PATCH)
await nocodb.update(table, id, data)
// Returns: { Id, ...fields }

// Delete record
await nocodb.delete(table, id)
// Returns: { msg: 'success' }

// Bulk create (array of flat objects)
await nocodb.bulkCreate(table, records)
// Returns: array of created records

// Count records with optional filter
await nocodb.count(table, where)
// Returns: number

// Internal: error handling throws descriptive message
// "NocoDB PATCH /api/v1/.../Monitor_State/42 => 404: Record not found"
```

---

## Per-File Migration Detail

### nocodb-client.js (NEW)

Shared helper. Wraps all 7 REST endpoints. Error handling on non-2xx throws with `"NocoDB {METHOD} {url} => {status}: {responseText}"`. No rate limiting (localhost).

Internal URL builder: `/api/v1/db/data/noco/{projectId}/{table}[/{id}][/count]`

Bulk endpoint: `/api/v1/db/data/bulk/noco/{projectId}/{table}/`

### write-persistence.js

| Function | Before | After |
|----------|--------|-------|
| `createAirtableRecord()` | POST to Airtable, body `{fields:{...}}` | `nocodb.create('Insider_Alerts', data)` |
| `updateMonitorState()` | PATCH to Airtable, body `{fields:{...}}` | `nocodb.update('Monitor_State', id, data)` |
| `createOrUpdateClusterSummary()` | POST/PATCH to Airtable | `nocodb.create('Cluster_Summaries', data)` + `nocodb.update(...)` |
| `writeSupabaseHistory()` | (was Supabase) | Stays in Supabase — unchanged |

Body changes: remove `{fields: {...}}` wrapper → send flat object directly.

Response changes: `data.id` (Airtable recID string) → `data.Id` (NocoDB integer).

### sec-monitor.js

| Function | Before | After |
|----------|--------|-------|
| `fetchDedupKeys()` | GET Airtable with `filterByFormula=IS_AFTER(...)` + cursor pagination | `nocodb.list('Insider_Alerts', { where: '(filing_date,gt,{date})', limit: 100, offset: 0 })` + offset pagination |
| Monitor State read | GET Airtable `{name}='market'` | `nocodb.list('Monitor_State', { where: '(name,eq,market)', limit: 1 })` |
| Monitor State write | PATCH Airtable | `nocodb.update('Monitor_State', id, data)` |

Pagination: switch from Airtable cursor (`data.offset`) to NocoDB integer offset (`pageInfo.isLastPage`).

Filter syntax: `IS_AFTER({filing_date}, '...')` → `(filing_date,gt,...)`

### score-alert.js

Track record lookup currently in Supabase (`/rest/v1/insider_alerts?insider_name=ilike.%name%&filing_date=gte.{date}`):

Replace with NocoDB `Insider_History` query:
```js
const history = await nocodb.list('Insider_History', {
  where: `(insider_name,like,%${normalizedName}%)~and(filing_date,gt,${cutoffStr})`,
  fields: 'ticker,filing_date,total_value',
  limit: 50
});
```

Remove Supabase PostgREST call and Supabase env vars from this function.

### analyze-alert.js

Audit for Airtable calls → replace with `nocodb.list()` / `nocodb.create()` / `nocodb.update()` as appropriate.

### deliver-alert.js

| Function | Before | After |
|----------|--------|-------|
| `fetchEligibleUsers()` | Airtable or Supabase | **Supabase only** (users are auth data) — keep Supabase call |
| `updateDeliveryLog()` | Airtable → `Alert_Delivery_Log` | `nocodb.create('Alert_Delivery_Log', data)` or `nocodb.update(...)` |

### x-auto-post.js

- `fetchPostedArticles()` Airtable `Articles` → `nocodb.list('Articles', { where, sort: '-published_date' })`
- `checkDailyPostCount()` → `nocodb.count('X_Post_Log', '(posted_date,eq,today)')`
- Post log write → `nocodb.create('X_Post_Log', data)`

### x-engagement.js

- Tweet log read → `nocodb.list('X_Engagement_Log', { where: '(tweet_id,eq,{id})' })`
- Replied check → `nocodb.list('X_Engagement_Log', { where: '(tweet_id,eq,{id})~and(replied,eq,true)' })`
- Tweet log write → `nocodb.create('X_Engagement_Log', data)`

### reddit-monitor.js

- Comment log read/write → `nocodb.list/create('Reddit_Log', ...)`
- `checkDailyCommentLimit()` → `nocodb.count('Reddit_Log', '(comment_date,eq,today)')`
- Upvote log → `nocodb.create/list('Reddit_Log', ...)`

### send-outreach.js

- `selectProspects()` → `nocodb.list('Outreach_Prospects', { where: '(status,eq,pending)', sort: '-score', limit: 10 })`
- Status update (sent/replied) → `nocodb.update('Outreach_Prospects', id, { status: 'sent' })`
- Follow-up scheduling → `nocodb.update('Outreach_Prospects', id, { followup_due_date: date })`
- **GAP 12.14 FIX**: Remove `ourArticle.url` (and any `url`/`href`/`http`) from first email prompt text

### find-prospects.js

- Prospect save → `nocodb.create('Outreach_Prospects', data)`
- Duplicate check → `nocodb.list('Outreach_Prospects', { where: '(domain,eq,{domain})', limit: 1 })` — check `list.length > 0`

---

## Environment Variables

### Remove

```
AIRTABLE_API_KEY
AIRTABLE_BASE_ID
INSIDER_ALERTS_TABLE_ID
MONITOR_STATE_TABLE_ID
(any other *_TABLE_ID vars)
```

### Add

```
NOCODB_API_TOKEN    # xc-token value from NocoDB API tokens UI
NOCODB_BASE_URL     # http://localhost:8080
NOCODB_PROJECT_ID   # NocoDB project identifier
```

---

## NocoDB Table Names

From spec (already set up in infrastructure unit):

| NocoDB Table | Replaces Airtable Table |
|-------------|------------------------|
| `Insider_Alerts` | Insider_Alerts |
| `Monitor_State` | Monitor_State |
| `Cluster_Summaries` | Cluster_Summaries |
| `Insider_History` | (was Supabase insider_alerts) |
| `Alert_Delivery_Log` | Alert_Delivery_Log |
| `X_Post_Log` | X_Post_Log |
| `X_Engagement_Log` | X_Engagement_Log |
| `Reddit_Log` | Reddit_Log |
| `Outreach_Prospects` | Outreach_Prospects |
| `Articles` | Articles |

---

## Test Requirements

### nocodb-client.test.js (NEW)

100% coverage on all 8 public methods using `makeFetch` / `makeFetchSeq` pattern:
- `list()`: with/without where, limit, offset, sort; with pagination; empty result
- `get()`: success, 404 error
- `create()`: flat body sent, returns `Id`
- `update()`: partial PATCH
- `delete()`: success
- `bulkCreate()`: array body
- `count()`: with/without where filter
- Error handling: non-2xx throws `"NocoDB {METHOD} {url} => {status}: {text}"`

### Migrated Test Files

For each of the 10 migrated files, update the corresponding test file:
- `BASE_ENV`: swap Airtable vars → NocoDB vars
- Mock responses: Airtable `{records:[...], offset:null}` → NocoDB `{list:[...], pageInfo:{isLastPage:true}}`
- Body assertions: `body.fields.x` → `body.x`
- URL assertions: `airtable.com` → `localhost:8080/api/v1`
- Pagination assertions: cursor-based → offset-based

### GAP 12.14 Verification Test

Test that the outreach prompt function returns a string with zero occurrences of:
- `http://`, `https://`, `.url`, `href=`, any URL pattern

---

## Definition of Done

1. `grep -r "airtable\|AIRTABLE" ryan_cole/insiderbuying-site/n8n/code/insiderbuying/ -i --include="*.js"` = 0 matches
2. All existing test suites pass with NocoDB mocks replacing Airtable mocks
3. `nocodb-client.test.js` passes with 100% method coverage
4. GAP 12.14: `send-outreach.js` first email prompt has no URL/link content
5. `NOCODB_API_TOKEN`, `NOCODB_BASE_URL`, `NOCODB_PROJECT_ID` documented; Airtable env vars removed

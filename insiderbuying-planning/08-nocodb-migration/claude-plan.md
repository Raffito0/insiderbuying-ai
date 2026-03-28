# Implementation Plan: 08-nocodb-migration

## Context

The EarlyInsider.com content pipeline runs as a set of n8n Code node JavaScript files. All persistence for SEC filing alerts, social media logs, and outreach data currently goes through Airtable's hosted REST API. Airtable's free tier has a hard 1,200-record limit, which the system will hit within 24 days at current alert volume.

NocoDB is already running on the same VPS as n8n (`http://localhost:8080`). It is self-hosted, PostgreSQL-backed, and has no record limits. The NocoDB schema was created in a prior unit (01-infrastructure) and the table/column names exactly match the existing Airtable field names.

This plan migrates 9 workflow files to call NocoDB instead of Airtable, creates a shared NocoDB REST client, fixes a cold-outreach compliance gap (no links in first emails), and updates all tests.

---

## What Is NOT Changing

This is a pure API client substitution. The following are explicitly out of scope:

- **Business logic** — classification, scoring, cluster detection, dedup keys, Anthropic/SEC/Yahoo Finance calls are unchanged
- **Supabase** — PostgREST calls for cluster sync and user/subscription data stay in Supabase. One exception: the track record lookup in `score-alert.js` currently hits Supabase but migrates to NocoDB `Insider_History`
- **NocoDB schema** — tables already exist, do not add or modify columns
- **n8n workflow JSON** — only the Code node JavaScript changes; workflow topology is unchanged

---

## Section 1: nocodb-client.js — Shared REST Client

### Why a Shared Client

All 24 existing workflow files construct Airtable URLs and headers inline — there is no shared HTTP abstraction. The migration is the right moment to introduce one: `nocodb-client.js` becomes the single place that knows NocoDB's URL scheme, auth header, and response shapes. All 9 migrated files delegate HTTP to this module.

### Pattern: fetchFn Dependency Injection

Every existing file already uses `fetchFn` dependency injection. The n8n entry block passes `(url, opts) => fetch(url, opts)`, and tests inject `jest.fn()` mocks. The NocoDB client must follow this same pattern — it accepts `fetchFn` as a constructor argument, not `require('https')` directly. This keeps the testing model consistent across the entire codebase.

### The NocoDB Class

`NocoDB` is a class with a constructor `(baseUrl, token, projectId, fetchFn)` and seven public methods. The constructor stores the four values; methods compose URLs and delegate to an internal `_req()` helper that sets the `xc-token` header, serializes JSON bodies, and throws a descriptive error on non-2xx responses.

The seven public methods map directly to the NocoDB v1 REST surface:

- `list(table, opts)` — GET with `where`, `limit`, `offset`, `sort`, `fields` (comma-separated string) query params. Returns `{ list, pageInfo }`.
- `get(table, id)` — GET single record by integer ID. Returns flat record object, or `null` if the server returns 404 (record not found is a normal outcome, not an error).
- `create(table, data)` — POST flat object. Returns created record with `Id`.
- `update(table, id, data)` — PATCH partial object. Callers MUST pass only the fields they intend to change — do NOT spread a full record object (NocoDB/Postgres fails on unknown or system-managed columns like `Id`, `created_at`). Returns updated record.
- `delete(table, id)` — DELETE. Returns success response.
- `bulkCreate(table, records)` — POST array of flat objects to the bulk endpoint. Internally chunks into batches of 200 and executes sequentially; returns a flattened array of all created records. This prevents Postgres parameter-limit errors on large inserts.
- `count(table, where)` — GET to the `/count` endpoint with optional `where` filter. The endpoint returns `{ count: N }`; the method unwraps this and returns the integer directly.

**Key behavioral details** that `deep-implement` must get right:

The bulk endpoint URL differs from single-record URLs: it is `/api/v1/db/data/bulk/noco/{projectId}/{tableName}/` (note `/bulk/` in path and trailing slash). The single-record URL is `/api/v1/db/data/noco/{projectId}/{tableName}[/{id}]`.

Error messages must include the HTTP method, full URL, status code, and response body text so failures are diagnosable from n8n logs: `"NocoDB PATCH /api/v1/.../Monitor_State/42 => 500: Internal Server Error"`. Do NOT log the `xc-token` header value in error messages.

**Retry with backoff**: `_req()` retries up to 3 times on 500/503 responses, with backoffs of 100ms, 300ms, and 1000ms. 4xx errors are not retried — they indicate a logic error and should surface immediately.

**Encoding dynamic values**: When callers build `where` strings with dynamic values (insider names, tickers, domains), they must pass values through `encodeURIComponent()`. Names containing commas, parentheses, or special characters will otherwise break NocoDB's `(field,op,value)` parser.

**Stable pagination**: All paginated `list()` calls should include `sort: '-Id'` to ensure deterministic ordering and prevent records from being skipped or duplicated if rows are inserted during the loop.

Rate limiting is zero — this is localhost.

### How Files Instantiate the Client

In each migrated file's n8n entry block:

```js
// Entry block (n8n Code node)
const nocodb = new NocoDB(
  env.NOCODB_BASE_URL, env.NOCODB_API_TOKEN, env.NOCODB_PROJECT_ID,
  (url, opts) => fetch(url, opts)
);
const helpers = { fetchFn: (url, opts) => fetch(url, opts), nocodb, _sleep, ... };
```

Functions that need NocoDB receive `opts.nocodb`. The pattern mirrors how `opts.fetchFn` is currently passed.

---

## Section 2: Alerts Pipeline — write-persistence.js, score-alert.js, analyze-alert.js, deliver-alert.js

### write-persistence.js

This file contains the main persistence layer: it writes new filings to `Insider_Alerts`, keeps `Monitor_State` current, and creates cluster summary records in `Cluster_Summaries`.

**Three Airtable functions to replace:**

`createAirtableRecord()` currently POSTs a `{fields: {...}}` wrapped body to `api.airtable.com/v0/{base}/{table}` and returns the Airtable `recXXX` string ID. Replace with `nocodb.create('Insider_Alerts', data)` where `data` is the flat filing object (no `fields` wrapper). The returned value changes from `data.id` (Airtable string) to `data.Id` (NocoDB integer). Code that stores this ID and later uses it for updates must handle an integer.

**Supabase type safety**: `writeSupabaseHistory()` passes the returned record ID to Supabase, which expects a string in its `airtable_record_id` column. Cast explicitly: `String(data.Id)` — do not pass the raw integer.

`updateMonitorState()` currently PATCHes `{fields: {...}}`. Replace with `nocodb.update('Monitor_State', id, data)`. The `id` here is the NocoDB integer ID; code that reads Monitor_State first needs to capture `record.Id`.

`createOrUpdateClusterSummary()` creates or updates in `Cluster_Summaries`. Replace with `nocodb.create(...)` for new clusters and `nocodb.update(...)` for updates to existing ones.

`writeSupabaseHistory()` — no change, stays in Supabase.

**Body structure change throughout**: `{ fields: { ticker, status, ... } }` → `{ ticker, status, ... }`. This is the single most pervasive mechanical change across all migrated files.

**Response shape change**: `data.id` (Airtable `recXXX`) → `data.Id` (NocoDB integer). Any downstream code that passes this ID to another function must be updated.

### score-alert.js

This file scores the significance of a filing by looking up the insider's track record — how many past buys they've made and what the hit rate was.

The track record query currently hits Supabase `insider_alerts` using PostgREST's ILIKE filter (case-insensitive). Per the interview decision, this specific query migrates to NocoDB `Insider_History`. The Supabase call is removed.

**Case sensitivity**: NocoDB's `like` operator maps to Postgres `LIKE`, which is case-sensitive. This is different from Supabase's `ilike` (case-insensitive). To preserve correct behavior: the implementation must lowercase `normalizedName` before interpolating into the where clause, AND the `insider_name` column in `Insider_History` must store names in lowercase. If names are stored in mixed case in NocoDB, the implementation should lowercase the query value AND use `like` with a lowercase match — or verify whether NocoDB exposes an `ilike` operator for this table.

The query: `(insider_name,like,%{encodedName}%)~and(filing_date,gt,{cutoffStr})`, where `encodedName` is the URL-encoded, lowercased normalized name.

The query should request only the fields needed for track record computation (`ticker`, `filing_date`, `total_value`) using the `fields` param to minimize response size.

Remove Supabase URL and key from this function's `opts` destructuring and `BASE_ENV` after migration.

### analyze-alert.js

Audit the file for any remaining Airtable calls — lookups for context or saves of analysis results. Replace using `nocodb.list()` / `nocodb.create()` / `nocodb.update()` as appropriate. Business logic (prompt building, Claude API calls) is unchanged.

### deliver-alert.js

**User fetch stays in Supabase**: `fetchEligibleUsers()` queries auth users with subscription tier. This was confirmed in the interview — users are auth data, Supabase boundary is not crossed.

**Alert delivery log migrates**: `updateDeliveryLog()` currently writes to Airtable `Alert_Delivery_Log`. Replace with `nocodb.create('Alert_Delivery_Log', data)` for new log entries and `nocodb.update(...)` for status updates.

The `subscription_tier` field name is identical in NocoDB, so no field name mapping is needed.

---

## Section 3: Social Pipeline — x-auto-post.js, x-engagement.js, reddit-monitor.js, sec-monitor.js

### x-auto-post.js

Two concerns: fetching articles to post and tracking what has already been posted today.

Article fetch: `nocodb.list('Articles', { where: '...', sort: '-published_date', limit: 10 })`. Filter to approved/unposted articles as the existing logic requires.

Daily post count check: use `nocodb.count('X_Post_Log', '(posted_date,eq,{today})')` — this replaces a list+count pattern against Airtable. NocoDB's dedicated count endpoint is more efficient.

Post log write: `nocodb.create('X_Post_Log', { tweet_id, content, posted_date })`.

### x-engagement.js

Tweet engagement tracking: reads `X_Engagement_Log` to check whether a tweet has already been replied to, then writes new engagement entries.

Replied check: `nocodb.list('X_Engagement_Log', { where: '(tweet_id,eq,{id})~and(replied,eq,true)', limit: 1 })` — if `list.length > 0`, already replied.

New engagement entry: `nocodb.create('X_Engagement_Log', data)`.

### reddit-monitor.js

Reddit comment tracking: reads/writes `Reddit_Log` for comment dedup and daily limit enforcement.

Daily comment limit: `nocodb.count('Reddit_Log', '(comment_date,eq,{today})')`.

Comment log read: `nocodb.list('Reddit_Log', { where: '(thread_id,eq,{id})', limit: 1 })`.

Comment log write: `nocodb.create('Reddit_Log', data)`.

### sec-monitor.js

This is the busiest file — it reads Monitor_State to get the last-processed filing date, fetches deduplicated keys from the last 7 days to prevent reprocessing, and writes Monitor_State back on completion.

**Monitor_State read/write**: Replace `{name}='market'` Airtable formula filter with NocoDB equivalent: `(name,eq,market)`. The state object has an `Id` field after the GET — store it for the subsequent update call.

**Dedup key fetch (pagination)**: The current Airtable pagination uses a cursor string (`data.offset`). NocoDB uses integer offset with `pageInfo.isLastPage`. Replace the `while (offset)` loop with a `while (!pageInfo.isLastPage)` loop incrementing `offset += limit`.

Filter translation: `IS_AFTER({filing_date}, '...')` → `(filing_date,gt,...)`.

**Cluster detection data**: Any other Airtable reads for cluster state → equivalent `nocodb.list()` with NocoDB filter syntax.

---

## Section 4: Outreach Pipeline — send-outreach.js, find-prospects.js

### send-outreach.js

Two concerns: prospect querying and the GAP 12.14 compliance fix.

**Prospect selection**: `selectProspects()` currently queries Airtable for pending prospects sorted by score. Replace with `nocodb.list('Outreach_Prospects', { where: '(status,eq,pending)', sort: '-score', limit: 10 })`.

**Status updates**: After sending, update prospect status to `sent`; after reply received, update to `replied`. Use `nocodb.update('Outreach_Prospects', id, { status: 'sent' })`.

**Follow-up scheduling**: Update `followup_due_date` field: `nocodb.update('Outreach_Prospects', id, { followup_due_date: date })`.

**GAP 12.14 — Zero Links in First Email**: Two-part fix: (1) Remove `ourArticle.url` from the prompt template string, AND (2) strip the `url` property from the article context object passed to the LLM for first-email generation — relying on prompt instructions alone is insufficient since the LLM may reconstruct or hallucinate links if the URL is present in context. An optional post-generation validation (regex check for `http://`, `https://`, `href=`) can be added as a safety net to scrub any accidentally generated URLs before the email is stored or sent.

### find-prospects.js

**Duplicate check**: Before saving a new prospect, check if domain exists: `nocodb.list('Outreach_Prospects', { where: '(domain,eq,{domain})', limit: 1 })`. If `list.length > 0`, skip.

**Prospect save**: `nocodb.create('Outreach_Prospects', prospectData)`.

---

## Section 5: Validation and Environment Cleanup

### Environment Variable Changes

Remove from all files: `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `INSIDER_ALERTS_TABLE_ID`, `MONITOR_STATE_TABLE_ID`, and any other `*_TABLE_ID` Airtable vars.

Add to all files: `NOCODB_API_TOKEN`, `NOCODB_BASE_URL`, `NOCODB_PROJECT_ID`.

The `REQUIRED_ENV` arrays at the top of each file must be updated to reflect this.

**Docker networking note**: `NOCODB_BASE_URL` should be `http://localhost:8080` if n8n and NocoDB run in the same container or on the host directly. If n8n and NocoDB are separate Docker containers in the same Compose network, use the service name: `http://nocodb:8080`. The env var abstracts this — the code does not hardcode either form.

### Deployment Order

Before deploying the migrated code, the following must be done in this order:

1. **Verify NocoDB schema** — confirm all tables listed in this plan exist with correct column names matching the Airtable field names
2. **Data backfill** (if applicable) — any historical data needed for correct operation (e.g., Monitor_State checkpoint, recent Insider_Alerts for dedup) must be present in NocoDB before the first run
3. **Update env vars** on the VPS — add `NOCODB_API_TOKEN`, `NOCODB_BASE_URL`, `NOCODB_PROJECT_ID`; remove Airtable vars
4. **Deploy new code** — merge and deploy the migrated workflow files

Do not deploy code pointing to NocoDB before the data is there, and do not remove Airtable env vars before the new code is deployed.

### Verification Grep

After all migration is complete, this command must return 0 matches:
```
grep -r "airtable\|AIRTABLE" ryan_cole/insiderbuying-site/n8n/code/insiderbuying/ -i --include="*.js"
```

No Airtable references should remain in any production code file.

### Test File Updates

For each of the 10 production files, the corresponding test file needs these mechanical changes:

**`BASE_ENV` object**: Remove Airtable keys, add NocoDB keys (`NOCODB_API_TOKEN`, `NOCODB_BASE_URL`, `NOCODB_PROJECT_ID`).

**Mock responses**: Change from Airtable's `{ records: [{id: 'rec...', fields: {...}}], offset: null }` to NocoDB's `{ list: [{Id: 1, fieldName: value}], pageInfo: { isLastPage: true, totalRows: 1 } }`.

**Body assertions**: Change `body.fields.ticker` → `body.ticker` (flat object, no `fields` wrapper). This is the most widespread change in tests.

**URL assertions**: Where tests check that `fetchFn` was called with a specific URL, update from `api.airtable.com/v0/appXXX/...` to `http://localhost:8080/api/v1/db/data/noco/...`.

**Pagination assertions**: Change Airtable cursor loop assertions to NocoDB `pageInfo.isLastPage` offset-based assertions.

### nocodb-client.test.js (New File)

Create alongside the production file. Test the NocoDB class in isolation with `makeFetch` / `makeFetchSeq` mocks (same pattern as all other test files in the repo). Cover all 8 public methods and the error path.

---

## Key API Differences to Keep in Mind

The implementer must know these translation rules throughout the migration:

**URL scheme**: Airtable `https://api.airtable.com/v0/{base}/{table}` → NocoDB `http://localhost:8080/api/v1/db/data/noco/{projectId}/{tableName}`. The bulk create URL differs: `/api/v1/db/data/bulk/noco/{projectId}/{tableName}/`.

**Auth**: Airtable `Authorization: Bearer {key}` → NocoDB `xc-token: {token}`.

**Request body**: Airtable wrapped `{ fields: { name: "x" } }` → NocoDB flat `{ name: "x" }`.

**Response body for list**: Airtable `{ records: [{ id: "recXXX", fields: { name: "x" } }], offset: "cursor" }` → NocoDB `{ list: [{ Id: 1, name: "x" }], pageInfo: { isLastPage: true } }`.

**Record ID**: Airtable string `recXXXXXXXXXXXXXX` → NocoDB integer `Id`. Access as `record.Id` not `record.id`.

**Filters**: Airtable formula string `filterByFormula=AND({f}='x',{f2}>0)` → NocoDB where param `(f,eq,x)~and(f2,gt,0)`.

**Sort**: Airtable `sort[0][field]=x&sort[0][direction]=desc` → NocoDB `sort=-x` (leading `-` = descending).

**Pagination**: Airtable cursor (`data.offset`) → NocoDB integer offset (`pageInfo.isLastPage`).

**Count**: Airtable has no count endpoint; NocoDB has `/count?where=...` returning `{ count: N }`.

---

## File Structure After Migration

```
ryan_cole/insiderbuying-site/n8n/code/insiderbuying/
  nocodb-client.js           <-- NEW: shared REST helper
  write-persistence.js       <-- migrated
  sec-monitor.js             <-- migrated
  score-alert.js             <-- migrated (+ Supabase track record removed)
  analyze-alert.js           <-- migrated
  deliver-alert.js           <-- migrated (users stay in Supabase)
  x-auto-post.js             <-- migrated
  x-engagement.js            <-- migrated
  reddit-monitor.js          <-- migrated
  send-outreach.js           <-- migrated + GAP 12.14 fix
  find-prospects.js          <-- migrated
  [other files unchanged]

ryan_cole/insiderbuying-site/tests/insiderbuying/
  nocodb-client.test.js      <-- NEW
  write-persistence.test.js  <-- updated mocks
  sec-monitor.test.js        <-- updated mocks
  score-alert.test.js        <-- updated mocks + removed Supabase test
  analyze-alert.test.js      <-- updated mocks
  deliver-alert.test.js      <-- updated mocks
  x-auto-post.test.js        <-- updated mocks
  x-engagement.test.js       <-- updated mocks
  reddit-monitor.test.js     <-- updated mocks
  send-outreach.test.js      <-- updated mocks + GAP 12.14 test
  find-prospects.test.js     <-- updated mocks
```

---

## Definition of Done

1. `grep -r "airtable\|AIRTABLE" ryan_cole/insiderbuying-site/n8n/code/insiderbuying/ -i --include="*.js"` returns 0 matches
2. All 10 existing test suites pass with NocoDB mocks replacing Airtable mocks
3. `nocodb-client.test.js` passes with coverage on all 8 public methods + error path
4. `send-outreach.js` first email template contains no URL, `http://`, `href`, or `ourArticle.url`
5. `NOCODB_API_TOKEN`, `NOCODB_BASE_URL`, `NOCODB_PROJECT_ID` documented in REQUIRED_ENV of each file; Airtable env vars removed

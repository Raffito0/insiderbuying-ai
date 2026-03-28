# TDD Plan: 08-nocodb-migration

## Testing Context

**Framework**: Jest (`testEnvironment: "node"`, test files in `tests/insiderbuying/*.test.js`)

**Patterns from codebase**:
- `makeFetch(response, ok, status)` — creates a `jest.fn()` mock that resolves once
- `makeFetchSeq(...calls)` — creates a sequential mock for multi-call flows
- `BASE_ENV` constant per file — all env vars needed for the module
- Inject `fetchFn` via `opts`; inject `nocodb` the same way after migration
- `expect(fetchFn).toHaveBeenCalledTimes(N)` and `JSON.parse(call[1].body)` for assertions

**How tests run**: `npm test` or `jest` in `ryan_cole/insiderbuying-site/`

---

## Section 1: nocodb-client.js — Shared REST Client

### Tests to write BEFORE implementing nocodb-client.js

Write `nocodb-client.test.js` first.

**Constructor**
- Test: NocoDB instance stores baseUrl, token, projectId, fetchFn as properties

**`list(table, opts)`**
- Test: calls GET with correct URL path `/api/v1/db/data/noco/{proj}/{table}`
- Test: passes `where`, `limit`, `offset`, `sort`, `fields` as query params when provided
- Test: omits query params when opts is empty
- Test: returns the `{ list, pageInfo }` shape from mock response
- Test: handles empty list response `{ list: [], pageInfo: { isLastPage: true } }`
- Test: includes `xc-token` header in every request

**`get(table, id)`**
- Test: calls GET with URL `.../table/42`
- Test: returns flat record object on success
- Test: returns `null` when server responds with 404 (not throw)
- Test: throws descriptive error on 500

**`create(table, data)`**
- Test: calls POST with flat JSON body (no `{fields:{}}` wrapper)
- Test: returns created record with `Id`
- Test: throws with method + URL + status on non-2xx

**`update(table, id, data)`**
- Test: calls PATCH to `.../table/42` with partial data
- Test: does not include `Id` or system fields in request if not passed by caller

**`delete(table, id)`**
- Test: calls DELETE to `.../table/42`
- Test: returns success response

**`bulkCreate(table, records)`**
- Test: calls POST to bulk endpoint `/api/v1/db/data/bulk/noco/{proj}/{table}/`
- Test: sends full array in single call when records <= 200
- Test: chunks into batches when records > 200 (200 + remainder) and makes 2 POST calls
- Test: returns flattened array of created records

**`count(table, where)`**
- Test: calls GET to `.../table/count`
- Test: passes `where` as query param when provided
- Test: returns the integer from `response.count` (unwrapped, not the raw object)
- Test: returns 0 when where filter matches nothing

**Error handling**
- Test: `_req()` retries on 500 up to 3 times (makeFetchSeq: 500, 500, 200)
- Test: `_req()` does NOT retry on 404 (throws immediately)
- Test: `_req()` does NOT retry on 400 (throws immediately)
- Test: error message includes HTTP method, URL path, status code, and response body

---

## Section 2: Alerts Pipeline

### Tests to write BEFORE migrating each file

#### write-persistence.js

Before changing any code, update `write-persistence.test.js`:

- Test: `createAirtableRecord()` (renamed `createNocoRecord()` or kept as-is) calls `nocodb.create('Insider_Alerts', ...)` with flat body — no `fields` wrapper
- Test: body contains expected filing fields (`dedup_key`, `ticker`, `insider_name`, `status: 'processed'`, etc.)
- Test: function returns `data.Id` (integer, not Airtable string)
- Test: when passing returned ID to `writeSupabaseHistory()`, the ID is cast with `String(data.Id)`
- Test: `updateMonitorState()` calls `nocodb.update('Monitor_State', id, data)` with only changed fields
- Test: `createOrUpdateClusterSummary()` calls `nocodb.create('Cluster_Summaries', ...)` for new clusters
- Test: `writeSupabaseHistory()` is unchanged — still hits Supabase URL
- Test: `BASE_ENV` uses `NOCODB_API_TOKEN` / `NOCODB_BASE_URL` / `NOCODB_PROJECT_ID`, not Airtable vars
- Test: response mock uses NocoDB shape `{ Id: 1, ...fields }` not Airtable `{ id: 'recXXX', fields: {...} }`

#### score-alert.js

- Test: track record lookup calls `nocodb.list('Insider_History', { where, fields, limit })` — not Supabase URL
- Test: `where` param uses NocoDB syntax `(insider_name,like,%name%)~and(filing_date,gt,date)`, not PostgREST
- Test: query value is URL-encoded (insider name with special chars)
- Test: Supabase PostgREST URL is no longer called in any test scenario
- Test: `BASE_ENV` no longer requires `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` for track record path

#### analyze-alert.js

- Test: any Airtable lookup calls replaced by `nocodb.list()` / `nocodb.get()`
- Test: analysis save calls `nocodb.create()` or `nocodb.update()` with flat body

#### deliver-alert.js

- Test: `fetchEligibleUsers()` still calls Supabase (not NocoDB) — Supabase URL remains in mock calls
- Test: `updateDeliveryLog()` calls `nocodb.create('Alert_Delivery_Log', data)` with flat body
- Test: no Airtable URL called in any path

---

## Section 3: Social Pipeline

### Tests to write BEFORE migrating each file

#### sec-monitor.js

- Test: Monitor_State read calls `nocodb.list('Monitor_State', { where: '(name,eq,market)', limit: 1 })`
- Test: Monitor_State write calls `nocodb.update('Monitor_State', state.Id, updatedData)`
- Test: dedup key fetch calls `nocodb.list('Insider_Alerts', { where: '(filing_date,gt,...)', sort: '-Id', limit: 100 })`
- Test: pagination loop uses `pageInfo.isLastPage` boolean to stop, not Airtable cursor
- Test: offset increments by `limit` on each page
- Test: dedup set built from `record.dedup_key` (flat field, not `record.fields.dedup_key`)

#### x-auto-post.js

- Test: article fetch calls `nocodb.list('Articles', ...)` — not Airtable
- Test: daily post count check calls `nocodb.count('X_Post_Log', '(posted_date,eq,...)')` and returns integer
- Test: post log write calls `nocodb.create('X_Post_Log', data)` with flat body

#### x-engagement.js

- Test: replied check calls `nocodb.list('X_Engagement_Log', { where: '(tweet_id,eq,...)~and(replied,eq,true)', limit: 1 })`
- Test: returns truthy when list.length > 0 (already replied)
- Test: engagement write calls `nocodb.create('X_Engagement_Log', data)`

#### reddit-monitor.js

- Test: daily comment limit check calls `nocodb.count('Reddit_Log', '(comment_date,eq,...)')`
- Test: comment existence check calls `nocodb.list('Reddit_Log', { where: '(thread_id,eq,...)', limit: 1 })`
- Test: log write calls `nocodb.create('Reddit_Log', data)`

---

## Section 4: Outreach Pipeline

### Tests to write BEFORE migrating each file

#### send-outreach.js

- Test: `selectProspects()` calls `nocodb.list('Outreach_Prospects', { where: '(status,eq,pending)', sort: '-score', limit: 10 })`
- Test: status update after send calls `nocodb.update('Outreach_Prospects', id, { status: 'sent' })` — partial body only
- Test: follow-up scheduling calls `nocodb.update('Outreach_Prospects', id, { followup_due_date: date })`
- **GAP 12.14 tests**:
  - Test: the first email prompt template string does not contain `http://`, `https://`, `.url`, or `href=`
  - Test: the article context object passed to the LLM for email #1 does not include a `url` property
  - Test (optional): if LLM output contains a URL pattern, post-processing strips it before return

#### find-prospects.js

- Test: duplicate check calls `nocodb.list('Outreach_Prospects', { where: '(domain,eq,...)', limit: 1 })`
- Test: returns early without creating when list.length > 0
- Test: prospect save calls `nocodb.create('Outreach_Prospects', prospectData)` with flat body

---

## Section 5: Validation and Environment Cleanup

### Tests to write BEFORE cleanup

- Test (integration marker): run `grep -r "airtable" insiderbuying/ --include="*.js" -i` in a test and assert 0 matches
- Test: `nocodb-client.test.js` has coverage for all 7 public methods + error path (verified by Jest coverage report)
- Test: `send-outreach.test.js` includes GAP 12.14 assertions (listed in Section 4)

---

## Test Execution Order

For each file, the TDD cycle is:
1. Update `BASE_ENV` in the test file (swap Airtable vars for NocoDB vars)
2. Update mock response shapes (Airtable `{ records: [...] }` to NocoDB `{ list: [...] }`)
3. Run existing tests — confirm they FAIL (red)
4. Migrate the production file to NocoDB
5. Run tests again — confirm they PASS (green)
6. Run `grep` verification — confirm 0 Airtable references remain in that file

Start with `nocodb-client.test.js` since all other tests depend on the NocoDB client pattern.

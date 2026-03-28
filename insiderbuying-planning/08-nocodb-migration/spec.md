# Spec: 08-nocodb-migration

## Purpose
Migrate all 9 n8n workflow files from Airtable REST API to NocoDB REST API. This is the P0 blocker — Airtable's free tier hits 1,200 record limit in 24 days at current alert volume. NocoDB is self-hosted on the same VPS (localhost latency, unlimited records, PostgreSQL-backed). Also fixes GAP 12.14 (URL in outreach email violates zero-link rule).

## Scope
**Files modified**: write-persistence.js, sec-monitor.js, score-alert.js, analyze-alert.js, deliver-alert.js, x-auto-post.js, x-engagement.js, reddit-monitor.js, send-outreach.js, find-prospects.js
**Files created**: `nocodb-client.js` — shared NocoDB REST helper (CRUD, filter, sort, paginate)
**Tests modified**: Corresponding test files for all migrated files
**Tests created**: nocodb-client.test.js

## Constraints
- NocoDB API base URL: `http://localhost:8080/api/v1` (same VPS as n8n)
- Auth: `xc-token` header (NocoDB API token, stored as `NOCODB_API_TOKEN` env var)
- CommonJS only — `require()` not `import`. No global `fetch` — use `require('https')`.
- Airtable field names map to NocoDB column names (may differ — check existing NocoDB schema)
- NocoDB filter syntax: `where=(fieldName,eq,value)~and(fieldName2,gt,0)` — different from Airtable formula syntax
- NocoDB linked records: `mm` (many-to-many) or `hm` (has-many) via `/api/v1/db/data/noco/{project}/{table}/{id}/{relation}` endpoint
- Existing NocoDB schema is already set up (from 01-infrastructure unit) — do NOT create tables, only migrate API calls

## Sections

### Section 1: nocodb-client.js — Shared Helper
Create `n8n/code/insiderbuying/nocodb-client.js` with:
- `NocoDB` class constructor: `(baseUrl, token, projectId)`
- `list(table, opts)` — GET with where, limit, offset, sort params
- `get(table, id)` — GET single record
- `create(table, data)` — POST single record
- `update(table, id, data)` — PATCH single record
- `delete(table, id)` — DELETE single record
- `bulkCreate(table, records)` — POST bulk (NocoDB bulk insert endpoint)
- `count(table, where)` — GET count for a filter
- Error handling: throw descriptive errors with table + operation context
- Rate limiting: 0 (localhost, no limit)
- Tests: CRUD operations with mock HTTPS responses

### Section 2: Alerts Pipeline Migration
Migrate: write-persistence.js + score-alert.js + analyze-alert.js + deliver-alert.js

write-persistence.js:
- Replace `createAirtableRecord()` → `nocodb.create('Insider_Alerts', data)`
- Replace `updateMonitorState()` → `nocodb.update('Monitor_State', id, data)`
- Replace `createClusterSummary()` → `nocodb.create('Cluster_Summaries', data)`
- Replace `writeSupabaseHistory()` → keep Supabase (Supabase is NOT being migrated, only Airtable → NocoDB)
- Field name mapping: Airtable `{fields: {...}}` wrapper → NocoDB flat `{...}` object

score-alert.js:
- Replace track record Supabase query → NocoDB `Insider_History` table query
- Replace return history lookup → NocoDB query (Supabase stays for auth/subscriptions only)
- Update filter syntax for insider name + ticker lookups

analyze-alert.js:
- Replace any Airtable lookups → NocoDB equivalents
- Keep analysis result save via NocoDB

deliver-alert.js:
- Replace `fetchEligibleUsers()` Airtable → NocoDB `Users` table (or Supabase — use Supabase for auth-related user data)
- Replace `updateDeliveryLog()` Airtable → NocoDB `Alert_Delivery_Log`
- Map free/pro tier field: Airtable `{subscription_tier}` → NocoDB column name

### Section 3: Social Pipeline Migration
Migrate: x-auto-post.js + x-engagement.js + reddit-monitor.js

x-auto-post.js:
- Replace posted article fetch from Airtable → NocoDB `Articles` table
- Replace `checkDailyPostCount()` Airtable → NocoDB `X_Post_Log` table
- Replace log write → NocoDB create

x-engagement.js:
- Replace tweet log read/write → NocoDB `X_Engagement_Log` table
- Replace replied check → NocoDB filter query

reddit-monitor.js:
- Replace comment log → NocoDB `Reddit_Log` table
- Replace `checkDailyCommentLimit()` → NocoDB count query
- Replace upvote log → NocoDB

sec-monitor.js:
- Replace Monitor_State read/write → NocoDB
- Replace duplicate check (dedup_key lookup) → NocoDB filter query
- Replace cluster detection data read → NocoDB

### Section 4: Outreach Pipeline Migration
Migrate: send-outreach.js + find-prospects.js

send-outreach.js:
- Replace `selectProspects()` Airtable query → NocoDB `Outreach_Prospects` table
- Replace status update (sent/replied/linked) → NocoDB update
- Replace follow-up scheduling → NocoDB `followup_due_date` field update
- FIX GAP 12.14: Remove `ourArticle.url` from email prompt entirely. The first outreach email must have ZERO links.

find-prospects.js:
- Replace prospect save → NocoDB `Outreach_Prospects` table
- Replace duplicate check → NocoDB filter by domain

### Section 5: Validation + Environment
- Update all test files to mock NocoDB instead of Airtable
- Create nocodb-client.test.js with full CRUD coverage
- Add `NOCODB_API_TOKEN` and `NOCODB_PROJECT_ID` to env var documentation
- Remove `AIRTABLE_API_KEY` and `AIRTABLE_BASE_ID` from all files
- Verify: `grep -r "airtable" n8n/code/insiderbuying/ --include="*.js" -i` should return 0 matches after migration
- All 9 migrated files must pass their existing test suites with NocoDB mocks

## Technical Reference

### NocoDB vs Airtable API Differences
| Operation | Airtable | NocoDB |
|-----------|----------|--------|
| List records | `GET /v0/{base}/{table}?filterByFormula=...` | `GET /api/v1/db/data/noco/{proj}/{table}?where=(field,eq,val)` |
| Create | `POST /v0/{base}/{table}` with `{fields: {...}}` | `POST /api/v1/db/data/noco/{proj}/{table}` with `{...}` (flat) |
| Update | `PATCH /v0/{base}/{table}/{id}` with `{fields: {...}}` | `PATCH /api/v1/db/data/noco/{proj}/{table}/{id}` with `{...}` |
| Filter | Airtable formula: `AND({field}='val', {field2}>0)` | NocoDB where: `(field,eq,val)~and(field2,gt,0)` |
| Sort | `sort[0][field]=name&sort[0][direction]=asc` | `sort=field` or `sort=-field` (prefix `-` = desc) |
| Count | No dedicated endpoint | `GET .../count?where=(...)` |

### NocoDB Table Names (from existing schema)
- `Insider_Alerts` — main alert records
- `Monitor_State` — last processed filing ID per ticker
- `Cluster_Summaries` — cluster buy summaries
- `X_Post_Log` — X post history
- `X_Engagement_Log` — X reply history
- `Reddit_Log` — Reddit comment history
- `Outreach_Prospects` — prospect list
- `Outreach_Log` — send/follow-up history
- `Articles` — published articles (NocoDB CMS)
- `Keywords` — keyword research table
- `Financial_Cache` — Dexter research cache
- `Alert_Delivery_Log` — delivery tracking
- `Insider_History` — track record for scoring

## Test Requirements
- Unit tests: each migrated file's test suite must pass with NocoDB mocks
- nocodb-client.test.js: 100% coverage on all 8 methods
- Integration marker: mock NocoDB server (http-mock or nock) responds correctly to CRUD
- Verify GAP 12.14 fix: test that outreach email prompt contains no URLs

## Definition of Done
- `grep -r "airtable\|AIRTABLE" n8n/code/insiderbuying/ -i --include="*.js"` = 0 matches
- All existing tests pass with NocoDB mocks replacing Airtable mocks
- nocodb-client.js has full JSDoc + test coverage
- GAP 12.14: `send-outreach.js` prompt has no URL/href/http in first email template
